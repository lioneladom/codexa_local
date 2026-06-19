import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateExamDto } from './dto/create-exam.dto';
import * as crypto from 'crypto';
import { ExecutionService } from '../execution/execution.service';
import { AstService } from '../ast/ast.service';
import { MonitoringGateway } from '../monitoring/monitoring.gateway';
import * as ExcelJS from 'exceljs';

@Injectable()
export class ExamsService {
  private lastAutoExpireCheck = 0;

  constructor(
    private prisma: PrismaService,
    private executionService: ExecutionService,
    private astService: AstService,
    private monitoringGateway: MonitoringGateway,
  ) {}

  private generateAccessCode(): string {
    return crypto.randomBytes(4).toString('hex').toUpperCase();
  }

  private generatePassword(): string {
    return crypto.randomBytes(6).toString('hex').toUpperCase();
  }

  async create(createExamDto: CreateExamDto, lecturerId: string, institutionId?: string) {
    const accessCode = this.generateAccessCode();

    return this.prisma.$transaction(async (prisma) => {
      const exam = await prisma.exam.create({
        data: {
          title: createExamDto.title,
          courseCode: createExamDto.courseCode,
          description: createExamDto.description,
          duration: createExamDto.duration,
          startDateTime: new Date(createExamDto.startDateTime),
          endDateTime: new Date(createExamDto.endDateTime),
          status: 'DRAFT',
          accessCode,
          studentPassword: createExamDto.studentPassword,
          invigilatorPassword: createExamDto.invigilatorPassword,
          enableMonitoring: createExamDto.enableMonitoring,
          shuffleQuestions: createExamDto.shuffleQuestions,
          shuffleOptions: createExamDto.shuffleOptions,
          lockAfterSubmit: createExamDto.lockAfterSubmit,
          lecturerId,
          institutionId,
        },
      });

      const questions = await Promise.all(
        createExamDto.questions.map(async (question) => {
          const savedQuestion = await prisma.question.create({
            data: {
              examId: exam.id,
              type: question.type as any,
              title: question.title,
              problemStatement: question.problemStatement,
              constraints: question.constraints,
              inputFormat: question.inputFormat,
              outputFormat: question.outputFormat,
              sampleInput: question.sampleInput,
              sampleOutput: question.sampleOutput,
              referenceSolution: question.referenceSolution,
              options: question.options,
              correctOption: question.correctOption,
              language: question.language,
              marks: question.marks,
              order: question.order,
            },
          });

          if (question.testCases && question.testCases.length > 0) {
            await Promise.all(
              question.testCases.map((tc, idx) =>
                prisma.testCase.create({
                  data: {
                    questionId: savedQuestion.id,
                    input: tc.input,
                    expectedOutput: tc.expectedOutput,
                    isHidden: tc.isHidden || false,
                    order: idx,
                  },
                }),
              ),
            );
          }

          return savedQuestion;
        }),
      );

      return { exam, questions };
    });
  }

  async update(id: string, updateExamDto: CreateExamDto, lecturerId: string, institutionId?: string) {
    const exam = await this.findOne(id, lecturerId);

    return this.prisma.$transaction(async (prisma) => {
      // Update the exam itself
      const updatedExam = await prisma.exam.update({
        where: { id },
        data: {
          title: updateExamDto.title,
          courseCode: updateExamDto.courseCode,
          description: updateExamDto.description,
          duration: updateExamDto.duration,
          startDateTime: new Date(updateExamDto.startDateTime),
          endDateTime: new Date(updateExamDto.endDateTime),
          studentPassword: updateExamDto.studentPassword,
          invigilatorPassword: updateExamDto.invigilatorPassword,
          enableMonitoring: updateExamDto.enableMonitoring,
          shuffleQuestions: updateExamDto.shuffleQuestions,
          shuffleOptions: updateExamDto.shuffleOptions,
          lockAfterSubmit: updateExamDto.lockAfterSubmit,
          status: 'DRAFT', // Revert status back to DRAFT so it can be adjusted and republished
        },
      });

      // Delete all existing questions and their test cases
      await prisma.testCase.deleteMany({
        where: { question: { examId: id } },
      });
      await prisma.question.deleteMany({
        where: { examId: id },
      });

      // Create new questions
      const questions = await Promise.all(
        updateExamDto.questions.map(async (question) => {
          const savedQuestion = await prisma.question.create({
            data: {
              examId: id,
              type: question.type as any,
              title: question.title,
              problemStatement: question.problemStatement,
              constraints: question.constraints,
              inputFormat: question.inputFormat,
              outputFormat: question.outputFormat,
              sampleInput: question.sampleInput,
              sampleOutput: question.sampleOutput,
              referenceSolution: question.referenceSolution,
              options: question.options,
              correctOption: question.correctOption,
              language: question.language,
              marks: question.marks,
              order: question.order,
            },
          });

          if (question.testCases && question.testCases.length > 0) {
            await Promise.all(
              question.testCases.map((tc, idx) =>
                prisma.testCase.create({
                  data: {
                    questionId: savedQuestion.id,
                    input: tc.input,
                    expectedOutput: tc.expectedOutput,
                    isHidden: tc.isHidden || false,
                    order: idx,
                  },
                }),
              ),
            );
          }

          return savedQuestion;
        }),
      );

      return { exam: updatedExam, questions };
    });
  }

  async findAll(lecturerId: string, institutionId?: string) {
    await this.autoExpireExams();
    // Return only minimal data for dashboard/exam list
    const exams = await this.prisma.exam.findMany({
      where: {
        lecturerId,
        institutionId,
      },
      select: {
        id: true,
        title: true,
        courseCode: true,
        status: true,
        duration: true,
        createdAt: true,
        accessCode: true,
        studentPassword: true,
        invigilatorPassword: true,
        _count: {
          select: {
            questions: true,
            examSessions: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';

    return exams.map(exam => ({
      ...exam,
      studentAccessUrl: exam.status === 'PUBLISHED' ? `${baseUrl}/exam/${exam.accessCode}` : null,
      invigilatorAccessUrl: exam.status === 'PUBLISHED' ? `${baseUrl}/invigilate/${exam.accessCode}` : null,
    }));
  }

  async findOne(id: string, lecturerId: string, institutionId?: string) {
    const exam = await this.prisma.exam.findUnique({
      where: { id },
      include: {
        questions: {
          include: {
            testCases: true,
          },
        },
      },
    });

    if (!exam) {
      throw new NotFoundException('Exam not found');
    }

    if (exam.lecturerId !== lecturerId) {
      throw new ForbiddenException('You do not have access to this exam');
    }

    return exam;
  }

  async publish(id: string, lecturerId: string) {
    const exam = await this.findOne(id, lecturerId);
    
    const studentPassword = exam.studentPassword || this.generatePassword();
    const invigilatorPassword = exam.invigilatorPassword || this.generatePassword();

    const updatedExam = await this.prisma.exam.update({
      where: { id },
      data: { 
        status: 'PUBLISHED',
        studentPassword,
        invigilatorPassword,
      },
    });

    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';

    return {
      exam: updatedExam,
      studentAccessUrl: `${baseUrl}/exam/${updatedExam.accessCode}`,
      invigilatorAccessUrl: `${baseUrl}/invigilate/${updatedExam.accessCode}`,
      studentPassword,
      invigilatorPassword,
    };
  }

  async archive(id: string, lecturerId: string) {
    const exam = await this.findOne(id, lecturerId);
    
    // Update all active exam sessions to COMPLETED when the exam is stopped by the lecturer
    await this.prisma.examSession.updateMany({
      where: {
        examId: id,
        status: 'ACTIVE',
      },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
      },
    });

    // Notify monitoring gateway that the exam has been stopped
    try {
      this.monitoringGateway.sendActivityToExam(id, 'EXAM_STOPPED', {
        examId: id,
      });
    } catch (err) {
      console.error('Failed to notify exam stopped:', err);
    }

    return this.prisma.exam.update({
      where: { id },
      data: { status: 'ARCHIVED' },
    });
  }

  async getPublishedExams() {
    await this.autoExpireExams();
    return this.prisma.exam.findMany({
      where: { status: 'PUBLISHED' },
      select: {
        id: true,
        title: true,
        courseCode: true,
        description: true,
        duration: true,
        startDateTime: true,
        endDateTime: true,
        accessCode: true,
      },
    });
  }

  async getExamByAccessCode(accessCode: string) {
    await this.autoExpireExams();
    return this.prisma.exam.findUnique({
      where: { accessCode: accessCode.toUpperCase() },
      include: {
        questions: {
          include: {
            testCases: true,
          },
          orderBy: {
            order: 'asc',
          },
        },
      },
    });
  }

  async createSession(accessCode: string, name: string, studentNumber: string, examPassword?: string) {
    await this.autoExpireExams();
    const exam = await this.prisma.exam.findUnique({
      where: { accessCode: accessCode.toUpperCase() },
      include: { questions: { orderBy: { order: 'asc' } } }
    });

    if (!exam) {
      throw new NotFoundException('Exam not found');
    }

    if (exam.status !== 'PUBLISHED') {
      throw new ForbiddenException('Exam is not active');
    }

    if (exam.studentPassword && exam.studentPassword !== examPassword) {
      throw new ForbiddenException('Incorrect exam password');
    }

    let session = await this.prisma.examSession.findFirst({
      where: {
        examId: exam.id,
        studentNumber,
      }
    });

    if (session) {
      if (session.status === 'COMPLETED') {
        throw new ForbiddenException('You have already submitted this exam.');
      }
      session = await this.prisma.examSession.update({
        where: { id: session.id },
        data: { status: 'ACTIVE' }
      });
    } else {
      session = await this.prisma.examSession.create({
        data: {
          examId: exam.id,
          studentName: name,
          studentNumber,
          status: 'ACTIVE',
          startedAt: new Date(),
        }
      });
    }

    const sanitizedQuestions = exam.questions.map(q => {
      const { referenceSolution, ...rest } = q;
      return rest;
    });

    this.monitoringGateway.sendActivityToExam(exam.id, 'STUDENT_JOIN', {
      sessionId: session.id,
      studentName: session.studentName,
      studentNumber: session.studentNumber,
      status: session.status,
      warningCount: session.warningCount,
    });

    return {
      session,
      exam: {
        ...exam,
        questions: sanitizedQuestions,
      }
    };
  }

  async submitQuestion(accessCode: string, sessionId: string, questionId: string, answerData: any) {
    const session = await this.prisma.examSession.findUnique({
      where: { id: sessionId },
      include: { exam: true }
    });

    if (!session || session.status !== 'ACTIVE') {
      throw new ForbiddenException('No active session found');
    }

    const question = await this.prisma.question.findUnique({
      where: { id: questionId },
      include: { testCases: true }
    });

    if (!question) {
      throw new NotFoundException('Question not found');
    }

    let score = 0;
    const details: any = {};

    if (question.type === 'PROGRAMMING') {
      const code = answerData.code || '';
      const language = answerData.language || question.language || 'javascript';
      const isTestOnly = answerData.isTestOnly || false;
      const testInput = answerData.testInput || '';

      let similarityRate = 1.0;
      if (question.referenceSolution) {
        try {
          if (this.astService) {
            const comp = this.astService.compareSolutions(code, question.referenceSolution, language);
            similarityRate = comp.similarity;
            details.astAnalysis = comp.studentFeatures;
            details.semanticSimilarity = Math.round(similarityRate * 100);
          }
        } catch (e) {
          console.error('AST parsing failed (non-critical error):', e);
        }
      }

      // Determine test cases to run
      let testCasesToRun: any[] = question.testCases;
      if (isTestOnly && testInput) {
        // Run only with the provided test input
        testCasesToRun = [{
          id: 'test-only',
          input: testInput,
          expectedOutput: '',
          isHidden: false,
          order: 0
        }];
      }

      let passedCount = 0;
      const testCaseResults: any[] = [];

      for (const tc of testCasesToRun) {
        const runRes = await this.executionService.executeCode(language, code, tc.input);
        const actualOutput = runRes.output.trim();
        const expectedOutput = tc.expectedOutput.trim();
        const match = ExecutionService.matchOutputs(actualOutput, expectedOutput);
        const passed = !isTestOnly && runRes.success && match.passed;

        if (passed) {
          passedCount++;
        }

        testCaseResults.push({
          testCaseId: tc.id,
          passed,
          actualOutput: actualOutput,
          errorMessage: runRes.error || null,
        });
      }

      const totalTestCases = testCasesToRun.length;
      let combinedRate = 0;
      if (totalTestCases === 0) {
        // If no test cases are defined, base the grade on semantic similarity
        combinedRate = similarityRate;
      } else {
        const testCasePassRate = passedCount / totalTestCases;
        if (testCasePassRate === 1.0) {
          // A perfect execution match always gets full marks
          combinedRate = 1.0;
        } else {
          // Otherwise, weight it: 80% test cases, 20% semantic similarity
          combinedRate = (testCasePassRate * 0.8) + (similarityRate * 0.2);
        }
      }
      score = !isTestOnly ? Math.round(combinedRate * question.marks) : 0;
      details.testCases = testCaseResults;
      details.passedCount = passedCount;
      details.totalCount = testCasesToRun.length;

      if (isTestOnly) {
        // Don't save to database for test runs
        return {
          testCases: testCaseResults,
        };
      }

      const existingSubmission = await this.prisma.submission.findFirst({
        where: { sessionId, questionId },
      });

      let submission;
      if (existingSubmission) {
        await this.prisma.result.deleteMany({
          where: { submissionId: existingSubmission.id },
        });

        submission = await this.prisma.submission.update({
          where: { id: existingSubmission.id },
          data: {
            code,
            language,
            status: 'GRADED',
            score,
            errorMessage: testCaseResults.find(r => r.errorMessage)?.errorMessage || null,
          }
        });
      } else {
        submission = await this.prisma.submission.create({
          data: {
            examId: session.examId,
            questionId,
            sessionId,
            code,
            language,
            status: 'GRADED',
            score,
            totalMarks: question.marks,
            errorMessage: testCaseResults.find(r => r.errorMessage)?.errorMessage || null,
          }
        });
      }

      await Promise.all(testCaseResults.map(r => 
        this.prisma.result.create({
          data: {
            submissionId: submission.id,
            testCaseId: r.testCaseId,
            passed: r.passed,
            actualOutput: r.actualOutput,
            errorMessage: r.errorMessage,
          }
        })
      ));

      this.monitoringGateway.sendActivityToExam(session.examId, 'STUDENT_SUBMISSION', {
        studentName: session.studentName,
        studentNumber: session.studentNumber,
        questionTitle: question.title,
        questionId: question.id,
        score,
        totalMarks: question.marks,
      });

      return {
        submission,
        testCases: testCaseResults,
      };

    } else if (question.type === 'MULTIPLE_CHOICE') {
      const selectedOption = answerData.selectedOption || '';
      const correct = selectedOption === question.correctOption;
      score = correct ? question.marks : 0;

      const existingSubmission = await this.prisma.submission.findFirst({
        where: { sessionId, questionId },
      });

      let submission;
      if (existingSubmission) {
        submission = await this.prisma.submission.update({
          where: { id: existingSubmission.id },
          data: {
            code: selectedOption,
            score,
          }
        });
      } else {
        submission = await this.prisma.submission.create({
          data: {
            examId: session.examId,
            questionId,
            sessionId,
            code: selectedOption,
            language: 'text',
            status: 'GRADED',
            score,
            totalMarks: question.marks,
          }
        });
      }

      this.monitoringGateway.sendActivityToExam(session.examId, 'STUDENT_SUBMISSION', {
        studentName: session.studentName,
        studentNumber: session.studentNumber,
        questionTitle: question.title,
        questionId: question.id,
        score,
        totalMarks: question.marks,
      });

      return { submission };

    } else if (question.type === 'FILL_IN_THE_BLANK') {
      const textAnswer = (answerData.answer || '').trim();
      const correctAnswers = (question.correctOption || '').split(',').map(a => a.trim().toLowerCase());
      const correct = correctAnswers.includes(textAnswer.toLowerCase());
      score = correct ? question.marks : 0;

      const existingSubmission = await this.prisma.submission.findFirst({
        where: { sessionId, questionId },
      });

      let submission;
      if (existingSubmission) {
        submission = await this.prisma.submission.update({
          where: { id: existingSubmission.id },
          data: {
            code: textAnswer,
            score,
          }
        });
      } else {
        submission = await this.prisma.submission.create({
          data: {
            examId: session.examId,
            questionId,
            sessionId,
            code: textAnswer,
            language: 'text',
            status: 'GRADED',
            score,
            totalMarks: question.marks,
          }
        });
      }

      this.monitoringGateway.sendActivityToExam(session.examId, 'STUDENT_SUBMISSION', {
        studentName: session.studentName,
        studentNumber: session.studentNumber,
        questionTitle: question.title,
        questionId: question.id,
        score,
        totalMarks: question.marks,
      });

      return { submission };

    } else {
      const textAnswer = answerData.answer || '';
      const existingSubmission = await this.prisma.submission.findFirst({
        where: { sessionId, questionId },
      });

      let submission;
      if (existingSubmission) {
        submission = await this.prisma.submission.update({
          where: { id: existingSubmission.id },
          data: {
            code: textAnswer,
          }
        });
      } else {
        submission = await this.prisma.submission.create({
          data: {
            examId: session.examId,
            questionId,
            sessionId,
            code: textAnswer,
            language: 'text',
            status: 'PENDING_REVIEW',
            score: 0,
            totalMarks: question.marks,
          }
        });
      }

      this.monitoringGateway.sendActivityToExam(session.examId, 'STUDENT_SUBMISSION', {
        studentName: session.studentName,
        studentNumber: session.studentNumber,
        questionTitle: question.title,
        questionId: question.id,
        score: submission.score || 0,
        totalMarks: question.marks,
      });

      return { submission };
    }
  }

  async submitExam(accessCode: string, sessionId: string) {
    const session = await this.prisma.examSession.findUnique({
      where: { id: sessionId }
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    const updatedSession = await this.prisma.examSession.update({
      where: { id: sessionId },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
      }
    });

    this.monitoringGateway.sendActivityToExam(session.examId, 'STUDENT_COMPLETED', {
      sessionId: session.id,
      studentName: session.studentName,
      studentNumber: session.studentNumber,
    });

    return updatedSession;
  }

  async logEvent(accessCode: string, sessionId: string, eventType: string, metadata?: string) {
    const session = await this.prisma.examSession.findUnique({
      where: { id: sessionId }
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    await this.prisma.activityLog.create({
      data: {
        examId: session.examId,
        sessionId,
        eventType,
        metadata,
        timestamp: new Date(),
      }
    });

    let updatedSession = session;
    if (eventType === 'TAB_SWITCH' || eventType === 'WARNING') {
      updatedSession = await this.prisma.examSession.update({
        where: { id: sessionId },
        data: {
          warningCount: {
            increment: 1,
          }
        }
      });
    }

    this.monitoringGateway.sendActivityToExam(session.examId, 'STUDENT_WARNING', {
      sessionId: session.id,
      studentName: session.studentName,
      studentNumber: session.studentNumber,
      eventType,
      warningCount: updatedSession.warningCount,
      metadata,
    });

    return updatedSession;
  }

  async getSessions(examId: string, lecturerId: string) {
    const exam = await this.prisma.exam.findUnique({ where: { id: examId } });
    if (!exam || exam.lecturerId !== lecturerId) {
      throw new ForbiddenException('Access denied');
    }

    return this.prisma.examSession.findMany({
      where: { examId },
      orderBy: { createdAt: 'desc' },
      include: {
        submissions: true,
      }
    });
  }

  async getSessionsByAccessCode(accessCode: string, invigilatorPassword?: string) {
    await this.autoExpireExams();
    const exam = await this.prisma.exam.findUnique({ where: { accessCode: accessCode.toUpperCase() } });
    if (!exam) {
      throw new NotFoundException('Exam not found');
    }
    if (exam.invigilatorPassword && exam.invigilatorPassword !== invigilatorPassword) {
      throw new ForbiddenException('Invalid invigilator password');
    }

    return this.prisma.examSession.findMany({
      where: { examId: exam.id },
      orderBy: { createdAt: 'desc' },
      include: {
        submissions: true,
      }
    });
  }

  async getSessionWithSubmissions(accessCode: string, sessionId: string) {
    const exam = await this.prisma.exam.findUnique({ where: { accessCode: accessCode.toUpperCase() } });
    if (!exam) {
      throw new NotFoundException('Exam not found');
    }

    const session = await this.prisma.examSession.findUnique({
      where: { id: sessionId },
      include: {
        submissions: {
          include: {
            question: true,
            results: true,
          }
        }
      }
    });
    if (!session) {
      throw new NotFoundException('Session not found');
    }

    return session;
  }

  async getDashboardStats(lecturerId: string, institutionId?: string) {
    await this.autoExpireExams();

    const totalExams = await this.prisma.exam.count({
      where: { lecturerId, institutionId }
    });
    const activeExams = await this.prisma.exam.count({
      where: { lecturerId, institutionId, status: 'PUBLISHED' }
    });
    const draftExams = await this.prisma.exam.count({
      where: { lecturerId, institutionId, status: 'DRAFT' }
    });

    const activeSessions = await this.prisma.examSession.count({
      where: {
        exam: { lecturerId, institutionId },
        status: 'ACTIVE'
      }
    });
    const completedSessions = await this.prisma.examSession.count({
      where: {
        exam: { lecturerId, institutionId },
        status: 'COMPLETED'
      }
    });

    const warningsAgg = await this.prisma.examSession.aggregate({
      where: {
        exam: { lecturerId, institutionId }
      },
      _sum: {
        warningCount: true
      }
    });
    const warningCount = warningsAgg._sum.warningCount || 0;

    const pendingReviews = await this.prisma.submission.count({
      where: {
        session: {
          exam: { lecturerId, institutionId }
        },
        status: 'PENDING_REVIEW'
      }
    });

    return {
      totalExams,
      activeExams,
      draftExams,
      activeSessions,
      completedSessions,
      warningCount,
      pendingReviews,
    };
  }

  async autoExpireExams() {
    const nowMs = Date.now();
    if (nowMs - this.lastAutoExpireCheck < 30000) {
      return;
    }
    this.lastAutoExpireCheck = nowMs;

    const now = new Date();
    await this.prisma.exam.updateMany({
      where: {
        status: 'PUBLISHED',
        endDateTime: {
          lt: now,
        },
      },
      data: {
        status: 'ARCHIVED',
      },
    });
  }

  async remove(id: string, lecturerId: string) {
    const exam = await this.findOne(id, lecturerId);
    if (!exam) {
      throw new NotFoundException('Exam not found');
    }

    return this.prisma.$transaction(async (prisma) => {
      // Find all questions associated with this exam
      const questions = await prisma.question.findMany({
        where: { examId: id },
        select: { id: true },
      });
      const questionIds = questions.map((q) => q.id);

      // Delete test cases
      await prisma.testCase.deleteMany({
        where: { questionId: { in: questionIds } },
      });

      // Delete questions
      await prisma.question.deleteMany({
        where: { examId: id },
      });

      // Find sessions
      const sessions = await prisma.examSession.findMany({
        where: { examId: id },
        select: { id: true },
      });
      const sessionIds = sessions.map((s) => s.id);

      // Find submissions
      const submissions = await prisma.submission.findMany({
        where: { sessionId: { in: sessionIds } },
        select: { id: true },
      });
      const submissionIds = submissions.map((sub) => sub.id);

      // Delete results
      await prisma.result.deleteMany({
        where: { submissionId: { in: submissionIds } },
      });

      // Delete submissions
      await prisma.submission.deleteMany({
        where: { sessionId: { in: sessionIds } },
      });

      // Delete sessions
      await prisma.examSession.deleteMany({
        where: { examId: id },
      });

      // Delete activity logs
      await prisma.activityLog.deleteMany({
        where: { examId: id },
      });

      // Delete exam
      return prisma.exam.delete({
        where: { id },
      });
    });
  }

  async recordWarning(sessionId: string, warningType: string, message: string) {
    const session = await this.prisma.examSession.findUnique({
      where: { id: sessionId },
      include: { exam: true },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    const updatedSession = await this.prisma.examSession.update({
      where: { id: sessionId },
      data: {
        warningCount: { increment: 1 },
      },
    });

    await this.prisma.activityLog.create({
      data: {
        examId: session.examId,
        sessionId: sessionId,
        eventType: warningType,
        metadata: JSON.stringify({ message }),
      },
    });

    this.monitoringGateway.sendActivityToExam(session.examId, 'WARNING', {
      sessionId: updatedSession.id,
      studentName: updatedSession.studentName,
      studentNumber: updatedSession.studentNumber,
      warningCount: updatedSession.warningCount,
      message,
    });

    return updatedSession;
  }

  async getReports(examId: string, lecturerId: string) {
    const exam = await this.prisma.exam.findUnique({
      where: { id: examId },
      include: {
        questions: true,
        examSessions: {
          include: {
            submissions: {
              include: {
                results: true
              }
            }
          }
        }
      }
    });

    if (!exam || exam.lecturerId !== lecturerId) {
      throw new ForbiddenException('Access denied');
    }

    const totalCandidates = exam.examSessions.length;
    const submittedCandidates = exam.examSessions.filter(s => s.status === 'COMPLETED').length;
    const onlineCandidates = exam.examSessions.filter(s => s.status === 'ACTIVE').length;

    let totalScoreSum = 0;
    let highestScore = 0;
    let lowestScore = totalCandidates > 0 ? 100 : 0;
    let passCount = 0;

    const candidateResults = exam.examSessions.map(session => {
      const totalScore = session.submissions.reduce((sum, sub) => sum + sub.score, 0);
      const totalPossible = exam.questions.reduce((sum, q) => sum + q.marks, 0) || 1;
      const percentage = (totalScore / totalPossible) * 100;
      const passed = percentage >= 50;

      if (passed) passCount++;
      totalScoreSum += percentage;
      if (percentage > highestScore) highestScore = percentage;
      if (percentage < lowestScore) lowestScore = percentage;

      let grade = 'F';
      if (percentage >= 80) grade = 'A';
      else if (percentage >= 70) grade = 'B';
      else if (percentage >= 60) grade = 'C';
      else if (percentage >= 50) grade = 'D';

      return {
        studentName: session.studentName,
        studentNumber: session.studentNumber,
        score: totalScore,
        maxScore: totalPossible,
        percentage: Math.round(percentage),
        grade,
        status: session.status,
        warningCount: session.warningCount,
        completedAt: session.completedAt,
        submissions: session.submissions.map(sub => {
          const question = exam.questions.find(q => q.id === sub.questionId);
          let semanticSimilarity: number | null = null;
          let astAnalysis: any = null;

          if (question && question.type === 'PROGRAMMING' && question.referenceSolution) {
            try {
              if (this.astService) {
                const comp = this.astService.compareSolutions(sub.code, question.referenceSolution, sub.language || question.language || 'javascript');
                semanticSimilarity = Math.round(comp.similarity * 100);
                astAnalysis = comp.studentFeatures;
              }
            } catch (e) {
              console.error('Failed on-the-fly semantic check:', e);
            }
          }

          return {
            questionId: sub.questionId,
            questionTitle: question?.title || 'Programming Question',
            code: sub.code,
            language: sub.language,
            score: sub.score,
            totalMarks: sub.totalMarks,
            status: sub.status,
            errorMessage: sub.errorMessage,
            results: sub.results,
            semanticSimilarity,
            astAnalysis,
          };
        })
      };
    });

    const averageScore = totalCandidates > 0 ? Math.round(totalScoreSum / totalCandidates) : 0;
    const passRate = totalCandidates > 0 ? Math.round((passCount / totalCandidates) * 100) : 0;

    return {
      examTitle: exam.title,
      courseCode: exam.courseCode,
      summary: {
        totalCandidates,
        submittedCandidates,
        onlineCandidates,
        averageScore,
        highestScore: Math.round(highestScore),
        lowestScore: Math.round(lowestScore),
        passRate,
      },
      candidateResults,
    };
  }

  async exportToExcel(examId: string, lecturerId: string): Promise<Buffer> {
    const report = await this.getReports(examId, lecturerId);
    
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Results');

    // Add header
    worksheet.columns = [
      { header: 'Student Name', key: 'studentName', width: 25 },
      { header: 'Student Number', key: 'studentNumber', width: 20 },
      { header: 'Score', key: 'score', width: 10 },
      { header: 'Max Score', key: 'maxScore', width: 10 },
      { header: 'Percentage', key: 'percentage', width: 12 },
      { header: 'Grade', key: 'grade', width: 8 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Warnings', key: 'warningCount', width: 10 },
    ];

    // Add rows
    report.candidateResults.forEach(candidate => {
      worksheet.addRow(candidate);
    });

    // Add summary at the end
    worksheet.addRow([]);
    worksheet.addRow(['Summary', '', '', '', '', '', '', '']);
    worksheet.addRow(['Total Candidates', report.summary.totalCandidates]);
    worksheet.addRow(['Submitted', report.summary.submittedCandidates]);
    worksheet.addRow(['Average Score', `${report.summary.averageScore}%`]);
    worksheet.addRow(['Pass Rate', `${report.summary.passRate}%`]);

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  async exportToHtml(examId: string, lecturerId: string): Promise<string> {
    const report = await this.getReports(examId, lecturerId);
    
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>${report.examTitle} - Results</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; }
        h1, h2 { color: #1a202c; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { border: 1px solid #e2e8f0; padding: 12px; text-align: left; }
        th { background-color: #f7fafc; font-weight: bold; }
        .summary { background-color: #edf2f7; padding: 20px; border-radius: 8px; margin: 20px 0; }
    </style>
</head>
<body>
    <h1>${report.examTitle}</h1>
    <p>Course Code: ${report.courseCode}</p>
    
    <div class="summary">
        <h2>Summary</h2>
        <p>Total Candidates: ${report.summary.totalCandidates}</p>
        <p>Submitted: ${report.summary.submittedCandidates}</p>
        <p>Online: ${report.summary.onlineCandidates}</p>
        <p>Average Score: ${report.summary.averageScore}%</p>
        <p>Pass Rate: ${report.summary.passRate}%</p>
        <p>Highest Score: ${report.summary.highestScore}%</p>
        <p>Lowest Score: ${report.summary.lowestScore}%</p>
    </div>
    
    <h2>Candidate Results</h2>
    <table>
        <thead>
            <tr>
                <th>Student Name</th>
                <th>Student Number</th>
                <th>Score</th>
                <th>Max Score</th>
                <th>Percentage</th>
                <th>Grade</th>
                <th>Status</th>
                <th>Warnings</th>
            </tr>
        </thead>
        <tbody>
            ${report.candidateResults.map(c => `
                <tr>
                    <td>${c.studentName}</td>
                    <td>${c.studentNumber}</td>
                    <td>${c.score}</td>
                    <td>${c.maxScore}</td>
                    <td>${c.percentage}%</td>
                    <td>${c.grade}</td>
                    <td>${c.status}</td>
                    <td>${c.warningCount}</td>
                </tr>
            `).join('')}
        </tbody>
    </table>
</body>
</html>`;

    return html;
  }
}
