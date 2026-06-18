'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getApiUrl } from '@/config/api';

interface TestCase {
  id?: string;
  input: string;
  expectedOutput: string;
  isHidden: boolean;
}

interface Question {
  id?: string;
  type: 'PROGRAMMING' | 'MULTIPLE_CHOICE' | 'SHORT_ANSWER' | 'LONG_ANSWER' | 'FILL_IN_THE_BLANK';
  title: string;
  problemStatement: string;
  constraints: string;
  inputFormat: string;
  outputFormat: string;
  sampleInput: string;
  sampleOutput: string;
  marks: number;
  order: number;
  referenceSolution: string;
  options: string[];
  correctOption: string;
  language: string;
  testCases: TestCase[];
}

interface QuestionBankItem {
  id: string;
  type: string;
  title: string;
  problemStatement: string;
  referenceSolution?: string;
  options?: string;
  correctOption?: string;
  language?: string;
  constraints?: string;
  inputFormat?: string;
  outputFormat?: string;
  sampleInput?: string;
  sampleOutput?: string;
  marks: number;
  createdAt: string;
  testCases?: TestCase[];
}

interface Exam {
  id: string;
  title: string;
  courseCode: string;
  description: string;
  duration: number;
  startDateTime: string;
  endDateTime: string;
  studentPassword?: string;
  invigilatorPassword?: string;
  enableMonitoring: boolean;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  lockAfterSubmit: boolean;
  showResults: boolean;
  questions: Question[];
}

function CreateExamInner() {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [showStudentPassword, setShowStudentPassword] = useState(false);
  const [showInvigilatorPassword, setShowInvigilatorPassword] = useState(false);
  const [questionBank, setQuestionBank] = useState<QuestionBankItem[]>([]);
  const [showQuestionBank, setShowQuestionBank] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fetchingExam, setFetchingExam] = useState(false);

  // Initialize with current date and default times
  const today = new Date().toISOString().slice(0, 10);
  const defaultStartTime = '09:00';
  const defaultEndTime = '11:00';

  const [examData, setExamData] = useState<{
    title: string;
    courseCode: string;
    description: string;
    examDate: string;
    startTime: string;
    endTime: string;
    duration: number;
    studentPassword?: string;
    invigilatorPassword?: string;
    enableMonitoring: boolean;
    shuffleQuestions: boolean;
    shuffleOptions: boolean;
    lockAfterSubmit: boolean;
    questions: Question[];
  }>({
    title: '',
    courseCode: '',
    description: '',
    examDate: today,
    startTime: defaultStartTime,
    endTime: defaultEndTime,
    duration: 120,
    studentPassword: '',
    invigilatorPassword: '',
    enableMonitoring: true,
    shuffleQuestions: false,
    shuffleOptions: false,
    lockAfterSubmit: true,
    questions: [
      {
        type: 'PROGRAMMING',
        title: '',
        problemStatement: '',
        constraints: '',
        inputFormat: '',
        outputFormat: '',
        sampleInput: '',
        sampleOutput: '',
        marks: 10,
        order: 1,
        referenceSolution: '',
        options: [],
        correctOption: '',
        language: 'javascript',
        testCases: [{ input: '', expectedOutput: '', isHidden: false }],
      },
    ],
  });

  const router = useRouter();
  const searchParams = useSearchParams();

  const fetchExam = async (id: string, token: string) => {
    setFetchingExam(true);
    try {
      const res = await fetch(`${getApiUrl()}/exams/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const exam: Exam = await res.json();
        const startDate = new Date(exam.startDateTime);
        const endDate = new Date(exam.endDateTime);
        
        setExamData({
          title: exam.title,
          courseCode: exam.courseCode,
          description: exam.description,
          examDate: startDate.toISOString().slice(0, 10),
          startTime: startDate.toTimeString().slice(0, 5),
          endTime: endDate.toTimeString().slice(0, 5),
          duration: exam.duration,
          studentPassword: exam.studentPassword,
          invigilatorPassword: exam.invigilatorPassword,
          enableMonitoring: exam.enableMonitoring,
          shuffleQuestions: exam.shuffleQuestions,
          shuffleOptions: exam.shuffleOptions,
          lockAfterSubmit: exam.lockAfterSubmit,
          questions: exam.questions.map(q => ({
            ...q,
            options: q.options ? (typeof q.options === 'string' ? JSON.parse(q.options) : q.options) : [],
          })),
        });
        setEditingId(id);
      }
    } catch (err) {
      console.error('Failed to fetch exam', err);
    } finally {
      setFetchingExam(false);
    }
  };

  useEffect(() => {
    setMounted(true);
    const token = localStorage.getItem('codexa_token');
    if (!token) {
      router.replace('/');
    } else {
      fetchQuestionBank(token);
      const editId = searchParams.get('edit');
      if (editId) {
        fetchExam(editId, token);
      }
    }
  }, [router, searchParams]);

  const fetchQuestionBank = async (token: string) => {
    try {
      const res = await fetch(`${getApiUrl()}/question-bank`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setQuestionBank(data);
      }
    } catch (err) {
      console.error('Failed to fetch question bank', err);
    }
  };

  const seedQuestionBank = async () => {
    try {
      const token = localStorage.getItem('codexa_token');
      const res = await fetch(`${getApiUrl()}/question-bank/seed`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        fetchQuestionBank(token!);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const addQuestionFromBank = (item: QuestionBankItem) => {
    const newQuestion: Question = {
      type: item.type as any,
      title: item.title,
      problemStatement: item.problemStatement,
      constraints: item.constraints || '',
      inputFormat: item.inputFormat || '',
      outputFormat: item.outputFormat || '',
      sampleInput: item.sampleInput || '',
      sampleOutput: item.sampleOutput || '',
      marks: item.marks,
      order: examData.questions.length + 1,
      referenceSolution: item.referenceSolution || '',
      options: item.options ? JSON.parse(item.options) : [],
      correctOption: item.correctOption || '',
      language: item.language || 'javascript',
      testCases: item.testCases
        ? item.testCases.map((tc) => ({
            input: tc.input,
            expectedOutput: tc.expectedOutput,
            isHidden: tc.isHidden || false,
          }))
        : [],
    };
    setExamData({ ...examData, questions: [...examData.questions, newQuestion] });
    setShowQuestionBank(false);
  };

  if (!mounted) return null;

  const addQuestion = () => {
    const newQuestion: Question = {
      type: 'PROGRAMMING',
      title: '',
      problemStatement: '',
      constraints: '',
      inputFormat: '',
      outputFormat: '',
      sampleInput: '',
      sampleOutput: '',
      marks: 10,
      order: examData.questions.length + 1,
      referenceSolution: '',
      options: [],
      correctOption: '',
      language: 'javascript',
      testCases: [{ input: '', expectedOutput: '', isHidden: false }],
    };
    setExamData({ ...examData, questions: [...examData.questions, newQuestion] });
  };

  const removeQuestion = (index: number) => {
    const newQuestions = [...examData.questions];
    newQuestions.splice(index, 1);
    setExamData({ ...examData, questions: newQuestions });
  };

  const addToQuestionBank = async (question: Question) => {
    const token = localStorage.getItem('codexa_token');
    if (!token) {
      router.replace('/');
      return;
    }

    try {
      const payload = {
        type: question.type,
        title: question.title,
        problemStatement: question.problemStatement,
        constraints: question.constraints,
        inputFormat: question.inputFormat,
        outputFormat: question.outputFormat,
        sampleInput: question.sampleInput,
        sampleOutput: question.sampleOutput,
        referenceSolution: question.referenceSolution,
        options: question.options.length > 0 ? JSON.stringify(question.options) : undefined,
        correctOption: question.correctOption,
        language: question.language,
        marks: question.marks,
        testCases: question.testCases.map((tc, idx) => ({ ...tc, order: idx })),
      };

      const res = await fetch(`${getApiUrl()}/question-bank`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        alert('Question added to question bank successfully!');
      } else {
        const errorText = await res.text();
        alert(`Failed to add question: ${errorText}`);
      }
    } catch (err) {
      console.error('Error adding to question bank:', err);
      alert(`Error: ${err}`);
    }
  };

  const addTestCase = (questionIndex: number) => {
    const newQuestions = [...examData.questions];
    newQuestions[questionIndex].testCases.push({
      input: '',
      expectedOutput: '',
      isHidden: false,
    });
    setExamData({ ...examData, questions: newQuestions });
  };

  const removeTestCase = (questionIndex: number, testCaseIndex: number) => {
    const newQuestions = [...examData.questions];
    newQuestions[questionIndex].testCases.splice(testCaseIndex, 1);
    setExamData({ ...examData, questions: newQuestions });
  };

  const addOption = (questionIndex: number) => {
    const newQuestions = [...examData.questions];
    newQuestions[questionIndex].options.push('');
    setExamData({ ...examData, questions: newQuestions });
  };

  const removeOption = (questionIndex: number, optionIndex: number) => {
    const newQuestions = [...examData.questions];
    newQuestions[questionIndex].options.splice(optionIndex, 1);
    setExamData({ ...examData, questions: newQuestions });
  };

  const handleQuestionChange = (
    questionIndex: number,
    field: keyof Question,
    value: any
  ) => {
    const newQuestions = [...examData.questions];
    (newQuestions[questionIndex] as any)[field] = value;
    setExamData({ ...examData, questions: newQuestions });
  };

  const handleTestCaseChange = (
    questionIndex: number,
    testCaseIndex: number,
    field: keyof TestCase,
    value: any
  ) => {
    const newQuestions = [...examData.questions];
    (newQuestions[questionIndex].testCases[testCaseIndex] as any)[field] = value;
    setExamData({ ...examData, questions: newQuestions });
  };

  const handleOptionChange = (
    questionIndex: number,
    optionIndex: number,
    value: string
  ) => {
    const newQuestions = [...examData.questions];
    newQuestions[questionIndex].options[optionIndex] = value;
    setExamData({ ...examData, questions: newQuestions });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const token = localStorage.getItem('codexa_token');
      
      // Combine date and time into valid ISO strings
      const startDateTime = new Date(`${examData.examDate}T${examData.startTime}`).toISOString();
      const endDateTime = new Date(`${examData.examDate}T${examData.endTime}`).toISOString();
      
      const payload = {
        title: examData.title,
        courseCode: examData.courseCode,
        description: examData.description,
        duration: examData.duration,
        startDateTime,
        endDateTime,
        studentPassword: examData.studentPassword,
        invigilatorPassword: examData.invigilatorPassword,
        enableMonitoring: examData.enableMonitoring,
        shuffleQuestions: examData.shuffleQuestions,
        shuffleOptions: examData.shuffleOptions,
        lockAfterSubmit: examData.lockAfterSubmit,
        questions: examData.questions.map(q => ({
          ...q,
          options: q.options.length > 0 ? JSON.stringify(q.options) : undefined,
        })),
      };

      console.log('Sending payload:', payload);

      const url = editingId 
        ? `${getApiUrl()}/exams/${editingId}` 
        : `${getApiUrl()}/exams`;
      const method = editingId ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      
      console.log('Response status:', res.status);
      const responseData = await res.text();
      console.log('Response data:', responseData);
      
      if (res.ok) {
        router.push('/dashboard/exams');
      } else {
        alert(`Error: ${res.status} - ${responseData}`);
      }
    } catch (err) {
      console.error('Error creating exam:', err);
      alert(`Error: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">{editingId ? 'Edit Exam' : 'Create Exam'}</h1>
        <button
          onClick={() => router.push('/dashboard/exams')}
          className="px-4 py-2 border border-border rounded-md hover:bg-muted"
        >
          Cancel
        </button>
      </div>

      <div className="mb-6 flex space-x-2 border-b pb-4">
        {[1, 2, 3, 4].map((s) => (
          <button
            key={s}
            onClick={() => setStep(s)}
            className={`px-4 py-2 rounded-md transition-colors ${
              s < step
                ? 'bg-primary text-primary-foreground'
                : s === step
                ? 'bg-primary/10 text-primary font-bold border border-primary'
                : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            {s === 1 && '1. Basic Info'}
            {s === 2 && '2. Security & Access'}
            {s === 3 && '3. Questions'}
            {s === 4 && '4. Review Exam'}
          </button>
        ))}
      </div>

      <div className="border border-border rounded-lg p-6">
        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold mb-4">Basic Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Exam Title *</label>
                <input
                  type="text"
                  value={examData.title}
                  onChange={(e) => setExamData({ ...examData, title: e.target.value })}
                  className="w-full px-4 py-2 border border-border rounded-md bg-input text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Course Code *</label>
                <input
                  type="text"
                  value={examData.courseCode}
                  onChange={(e) => setExamData({ ...examData, courseCode: e.target.value })}
                  className="w-full px-4 py-2 border border-border rounded-md bg-input text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Description</label>
              <textarea
                value={examData.description}
                onChange={(e) => setExamData({ ...examData, description: e.target.value })}
                className="w-full px-4 py-2 border border-border rounded-md bg-input text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                rows={4}
              />
            </div>
             <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Exam Date *</label>
                <input
                  type="date"
                  value={examData.examDate}
                  onChange={(e) => setExamData({ ...examData, examDate: e.target.value })}
                  onClick={(e) => {
                    try { e.currentTarget.showPicker(); } catch (err) {}
                  }}
                  className="w-full px-4 py-2 border border-border rounded-md bg-input text-foreground focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer [&::-webkit-calendar-picker-indicator]:dark:invert"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Start Time *</label>
                <input
                  type="time"
                  value={examData.startTime}
                  onChange={(e) => setExamData({ ...examData, startTime: e.target.value })}
                  onClick={(e) => {
                    try { e.currentTarget.showPicker(); } catch (err) {}
                  }}
                  className="w-full px-4 py-2 border border-border rounded-md bg-input text-foreground focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer [&::-webkit-calendar-picker-indicator]:dark:invert"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">End Time *</label>
                <input
                  type="time"
                  value={examData.endTime}
                  onChange={(e) => setExamData({ ...examData, endTime: e.target.value })}
                  onClick={(e) => {
                    try { e.currentTarget.showPicker(); } catch (err) {}
                  }}
                  className="w-full px-4 py-2 border border-border rounded-md bg-input text-foreground focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer [&::-webkit-calendar-picker-indicator]:dark:invert"
                  required
                />
              </div>
            </div>
            <div className="mt-4">
              <label className="block text-sm font-medium mb-2">Duration (minutes) *</label>
              <input
                type="number"
                value={examData.duration}
                onChange={(e) => setExamData({ ...examData, duration: parseInt(e.target.value) || 0 })}
                className="w-full px-4 py-2 border border-border rounded-md bg-input text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                min={1}
                required
              />
              <p className="text-xs text-muted-foreground mt-1">
                Current duration: {Math.floor(examData.duration / 60)}h {examData.duration % 60}m
              </p>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold mb-4">Security & Access</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Student Password (leave blank to auto-generate)
                </label>
                <div className="relative">
                  <input
                    type={showStudentPassword ? 'text' : 'password'}
                    value={examData.studentPassword}
                    onChange={(e) => setExamData({ ...examData, studentPassword: e.target.value })}
                    className="w-full px-4 py-2 pr-10 border border-border rounded-md bg-input text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <button
                    type="button"
                    onClick={() => setShowStudentPassword(!showStudentPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showStudentPassword ? (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">
                  Invigilator Password (leave blank to auto-generate)
                </label>
                <div className="relative">
                  <input
                    type={showInvigilatorPassword ? 'text' : 'password'}
                    value={examData.invigilatorPassword}
                    onChange={(e) => setExamData({ ...examData, invigilatorPassword: e.target.value })}
                    className="w-full px-4 py-2 pr-10 border border-border rounded-md bg-input text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <button
                    type="button"
                    onClick={() => setShowInvigilatorPassword(!showInvigilatorPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showInvigilatorPassword ? (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            </div>
            <div className="space-y-3 mt-4">
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={examData.enableMonitoring}
                  onChange={(e) => setExamData({ ...examData, enableMonitoring: e.target.checked })}
                  className="rounded"
                />
                <span>Enable Monitoring</span>
              </label>
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={examData.shuffleQuestions}
                  onChange={(e) => setExamData({ ...examData, shuffleQuestions: e.target.checked })}
                  className="rounded"
                />
                <span>Shuffle Questions</span>
              </label>
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={examData.shuffleOptions}
                  onChange={(e) => setExamData({ ...examData, shuffleOptions: e.target.checked })}
                  className="rounded"
                />
                <span>Shuffle Multiple Choice Options</span>
              </label>
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={examData.lockAfterSubmit}
                  onChange={(e) => setExamData({ ...examData, lockAfterSubmit: e.target.checked })}
                  className="rounded"
                />
                <span>Lock Exam After Submission</span>
              </label>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold">Questions</h2>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowQuestionBank(!showQuestionBank)}
                  className="px-4 py-2 bg-secondary text-secondary-foreground rounded-md hover:opacity-90"
                >
                  Question Bank
                </button>
                <button
                  type="button"
                  onClick={addQuestion}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:opacity-90"
                >
                  Add Question
                </button>
              </div>
            </div>

            {showQuestionBank && (
              <div className="border border-border rounded-md p-4 mb-4">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-semibold">Question Bank</h3>
                  <div className="flex gap-2">
                    <button
                      onClick={seedQuestionBank}
                      className="px-3 py-1 text-sm bg-muted rounded-md hover:bg-muted/80"
                    >
                      Seed Sample Questions
                    </button>
                    <button
                      onClick={() => setShowQuestionBank(false)}
                      className="px-3 py-1 text-sm border border-border rounded-md hover:bg-muted"
                    >
                      Close
                    </button>
                  </div>
                </div>
                <div className="grid gap-3">
                  {questionBank.map((item) => (
                    <div key={item.id} className="border border-border rounded-md p-3 flex justify-between items-center">
                      <div>
                        <h4 className="font-medium">{item.title}</h4>
                        <p className="text-sm text-muted-foreground">{item.type} - {item.marks} marks</p>
                      </div>
                      <button
                        onClick={() => addQuestionFromBank(item)}
                        className="px-3 py-1 bg-primary text-primary-foreground rounded-md text-sm hover:opacity-90"
                      >
                        Add
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {examData.questions.map((question, qIndex) => (
              <div key={qIndex} className="border border-border rounded-lg p-4">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-medium">Question {qIndex + 1}</h3>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => addToQuestionBank(question)}
                      className="px-3 py-1 text-sm bg-green-600 text-white rounded-md hover:opacity-90"
                    >
                      Add to Question Bank
                    </button>
                    {examData.questions.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeQuestion(qIndex)}
                        className="px-3 py-1 text-sm bg-destructive text-destructive-foreground rounded-md hover:opacity-90"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-2">Type *</label>
                      <select
                        value={question.type}
                        onChange={(e) =>
                          handleQuestionChange(qIndex, 'type', e.target.value as any)
                        }
                        className="w-full px-4 py-2 border border-border rounded-md bg-input text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                      >
                        <option value="PROGRAMMING">Programming</option>
                        <option value="MULTIPLE_CHOICE">Multiple Choice</option>
                        <option value="SHORT_ANSWER">Short Answer</option>
                        <option value="LONG_ANSWER">Long Answer (Theory/Essay)</option>
                        <option value="FILL_IN_THE_BLANK">Fill in the Blank</option>
                      </select>
                    </div>
                    {question.type === 'PROGRAMMING' && (
                      <div>
                        <label className="block text-sm font-medium mb-2">Language</label>
                        <select
                          value={question.language}
                          onChange={(e) =>
                            handleQuestionChange(qIndex, 'language', e.target.value)
                          }
                          className="w-full px-4 py-2 border border-border rounded-md bg-input text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                        >
                          <option value="javascript">JavaScript</option>
                          <option value="python">Python</option>
                          <option value="java">Java</option>
                          <option value="cpp">C++</option>
                          <option value="c">C</option>
                          <option value="csharp">C#</option>
                          <option value="go">Go</option>
                        </select>
                      </div>
                    )}
                    <div className="md:col-span-1">
                      <label className="block text-sm font-medium mb-2">Marks *</label>
                      <input
                        type="number"
                        value={question.marks}
                        onChange={(e) =>
                          handleQuestionChange(qIndex, 'marks', parseInt(e.target.value))
                        }
                        className="w-full px-4 py-2 border border-border rounded-md bg-input text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                        min={1}
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">Order</label>
                      <input
                        type="number"
                        value={question.order}
                        onChange={(e) =>
                          handleQuestionChange(qIndex, 'order', parseInt(e.target.value))
                        }
                        className="w-full px-4 py-2 border border-border rounded-md bg-input text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                        min={1}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Title *</label>
                    <input
                      type="text"
                      value={question.title}
                      onChange={(e) => handleQuestionChange(qIndex, 'title', e.target.value)}
                      className="w-full px-4 py-2 border border-border rounded-md bg-input text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Problem Statement *</label>
                    <textarea
                      value={question.problemStatement}
                      onChange={(e) =>
                        handleQuestionChange(qIndex, 'problemStatement', e.target.value)
                      }
                      className="w-full px-4 py-2 border border-border rounded-md bg-input text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                      rows={4}
                      required
                    />
                  </div>
                  {question.type === 'MULTIPLE_CHOICE' && (
                    <div>
                      <div className="flex justify-between items-center mb-3">
                        <label className="text-sm font-medium">Options</label>
                        <button
                          type="button"
                          onClick={() => addOption(qIndex)}
                          className="px-3 py-1 text-sm bg-secondary text-secondary-foreground rounded-md hover:opacity-90"
                        >
                          Add Option
                        </button>
                      </div>
                      {question.options.map((option, oIndex) => (
                        <div key={oIndex} className="flex gap-2 items-center mb-2">
                          <input
                            type="radio"
                            name={`correct-${qIndex}`}
                            checked={question.correctOption === option}
                            onChange={(e) => handleQuestionChange(qIndex, 'correctOption', option)}
                            className="mt-1"
                          />
                          <input
                            type="text"
                            value={option}
                            onChange={(e) => handleOptionChange(qIndex, oIndex, e.target.value)}
                            placeholder={`Option ${String.fromCharCode(65 + oIndex)}`}
                            className="flex-1 px-3 py-2 border border-border rounded-md bg-input text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                          />
                          {question.options.length > 2 && (
                            <button
                              type="button"
                              onClick={() => removeOption(qIndex, oIndex)}
                              className="text-sm text-destructive hover:underline"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {question.type === 'SHORT_ANSWER' && (
                    <div>
                      <label className="block text-sm font-medium mb-2">Correct Answer (Exact Match)</label>
                      <input
                        type="text"
                        value={question.correctOption}
                        onChange={(e) => handleQuestionChange(qIndex, 'correctOption', e.target.value)}
                        placeholder="E.g., Capital City or numeric answer"
                        className="w-full px-4 py-2 border border-border rounded-md bg-input text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                        required
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        System will automatically match this exact value case-insensitively.
                      </p>
                    </div>
                  )}

                  {question.type === 'FILL_IN_THE_BLANK' && (
                    <div>
                      <label className="block text-sm font-medium mb-2">Expected Words/Phrases (Comma separated for multiple blanks)</label>
                      <input
                        type="text"
                        value={question.correctOption}
                        onChange={(e) => handleQuestionChange(qIndex, 'correctOption', e.target.value)}
                        placeholder="E.g., database, server"
                        className="w-full px-4 py-2 border border-border rounded-md bg-input text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                        required
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Use [blank] inside your Problem Statement where students should input answers.
                      </p>
                    </div>
                  )}

                  {question.type === 'LONG_ANSWER' && (
                    <div>
                      <label className="block text-sm font-medium mb-2">Grading Reference solution / Guidelines (Optional)</label>
                      <textarea
                        value={question.referenceSolution}
                        onChange={(e) => handleQuestionChange(qIndex, 'referenceSolution', e.target.value)}
                        placeholder="Provide details on what a complete answer should include..."
                        className="w-full px-4 py-2 border border-border rounded-md bg-input text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                        rows={4}
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Lecturer will review and mark submissions manually.
                      </p>
                    </div>
                  )}
                  {question.type === 'PROGRAMMING' && (
                    <>
                      <div>
                        <label className="block text-sm font-medium mb-2">Constraints</label>
                        <textarea
                          value={question.constraints}
                          onChange={(e) =>
                            handleQuestionChange(qIndex, 'constraints', e.target.value)
                          }
                          className="w-full px-4 py-2 border border-border rounded-md bg-input text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                          rows={3}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">Input Format</label>
                        <textarea
                          value={question.inputFormat}
                          onChange={(e) =>
                            handleQuestionChange(qIndex, 'inputFormat', e.target.value)
                          }
                          className="w-full px-4 py-2 border border-border rounded-md bg-input text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                          rows={3}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">Output Format</label>
                        <textarea
                          value={question.outputFormat}
                          onChange={(e) =>
                            handleQuestionChange(qIndex, 'outputFormat', e.target.value)
                          }
                          className="w-full px-4 py-2 border border-border rounded-md bg-input text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                          rows={3}
                        />
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium mb-2">Sample Input</label>
                          <textarea
                            value={question.sampleInput}
                            onChange={(e) =>
                              handleQuestionChange(qIndex, 'sampleInput', e.target.value)
                            }
                            className="w-full px-4 py-2 border border-border rounded-md bg-input text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                            rows={3}
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-2">Sample Output</label>
                          <textarea
                            value={question.sampleOutput}
                            onChange={(e) =>
                              handleQuestionChange(qIndex, 'sampleOutput', e.target.value)
                            }
                            className="w-full px-4 py-2 border border-border rounded-md bg-input text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                            rows={3}
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">Reference Solution</label>
                        <textarea
                          value={question.referenceSolution}
                          onChange={(e) =>
                            handleQuestionChange(qIndex, 'referenceSolution', e.target.value)
                          }
                          className="w-full px-4 py-2 border border-border rounded-md bg-input text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-ring"
                          rows={8}
                        />
                      </div>
                      <div>
                        <div className="flex justify-between items-center mb-4">
                          <label className="text-sm font-medium">Test Cases</label>
                          <button
                            type="button"
                            onClick={() => addTestCase(qIndex)}
                            className="px-3 py-1 text-sm bg-secondary text-secondary-foreground rounded-md hover:opacity-90"
                          >
                            Add Test Case
                          </button>
                        </div>
                        {question.testCases.map((testCase, tcIndex) => (
                          <div key={tcIndex} className="border border-border rounded-md p-4 mb-2">
                            <div className="flex justify-between items-center mb-2">
                              <span className="text-sm text-muted-foreground">Test Case {tcIndex + 1}</span>
                              {question.testCases.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => removeTestCase(qIndex, tcIndex)}
                                  className="text-sm text-destructive hover:underline"
                                >
                                  Remove
                                </button>
                              )}
                            </div>
                            <div className="space-y-3">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                  <label className="block text-xs font-medium mb-1">Input</label>
                                  <textarea
                                    value={testCase.input}
                                    onChange={(e) =>
                                      handleTestCaseChange(qIndex, tcIndex, 'input', e.target.value)
                                    }
                                    className="w-full px-3 py-2 border border-border rounded-md bg-input text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                                    rows={3}
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs font-medium mb-1">Expected Output</label>
                                  <textarea
                                    value={testCase.expectedOutput}
                                    onChange={(e) =>
                                      handleTestCaseChange(qIndex, tcIndex, 'expectedOutput', e.target.value)
                                    }
                                    className="w-full px-3 py-2 border border-border rounded-md bg-input text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                                    rows={3}
                                  />
                                </div>
                              </div>
                              <label className="flex items-center space-x-2">
                                <input
                                  type="checkbox"
                                  checked={testCase.isHidden}
                                  onChange={(e) =>
                                    handleTestCaseChange(qIndex, tcIndex, 'isHidden', e.target.checked)
                                  }
                                  className="rounded"
                                />
                                <span className="text-sm">Hidden Test Case</span>
                              </label>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold mb-4">Review Exam</h2>
            <div className="border border-border rounded-md p-4">
              <h3 className="font-semibold">{examData.title}</h3>
              <p className="text-muted-foreground">Course Code: {examData.courseCode}</p>
              <p>Duration: {examData.duration} min</p>
              <p>Questions: {examData.questions.length}</p>
              <p>Total Marks: {examData.questions.reduce((sum, q) => sum + q.marks, 0)}</p>
            </div>
            <div className="flex gap-2 pt-4 border-t border-border">
              <button
                onClick={() => setStep(3)}
                className="px-4 py-2 border border-border rounded-md hover:bg-muted"
              >
                Back
              </button>
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50"
              >
                {loading ? (editingId ? 'Updating Exam...' : 'Creating Exam...') : (editingId ? 'Update Exam' : 'Create Exam')}
              </button>
            </div>
          </div>
        )}

        {step !== 4 && (
          <div className="flex gap-2 pt-4 border-t border-border mt-4">
            {step > 1 && (
              <button
                onClick={() => setStep(step - 1)}
                className="px-4 py-2 border border-border rounded-md hover:bg-muted"
              >
                Back
              </button>
            )}
            {step < 4 && (
              <button
                onClick={() => setStep(step + 1)}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:opacity-90"
              >
                Next
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function CreateExamPage() {
  return (
    <Suspense fallback={<div className="p-6">Loading...</div>}>
      <CreateExamInner />
    </Suspense>
  );
}
