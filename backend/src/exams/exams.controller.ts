import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Delete,
  Param,
  UseGuards,
  Request,
  Res,
} from '@nestjs/common';
import { ExamsService } from './exams.service';
import { CreateExamDto } from './dto/create-exam.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import type { Response } from 'express';

@Controller('exams')
export class ExamsController {
  constructor(private readonly examsService: ExamsService) {}

  @Get('published')
  getPublishedExams() {
    return this.examsService.getPublishedExams();
  }

  @Get('access/:accessCode')
  getExamByAccessCode(@Param('accessCode') accessCode: string) {
    return this.examsService.getExamByAccessCode(accessCode);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('LECTURER', 'ADMIN')
  create(@Body() createExamDto: CreateExamDto, @Request() req: any) {
    return this.examsService.create(createExamDto, req.user.sub, req.user.institutionId);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('LECTURER', 'ADMIN')
  update(@Param('id') id: string, @Body() updateExamDto: CreateExamDto, @Request() req: any) {
    return this.examsService.update(id, updateExamDto, req.user.sub, req.user.institutionId);
  }

  @Get('dashboard-stats')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('LECTURER', 'ADMIN')
  getDashboardStats(@Request() req: any) {
    return this.examsService.getDashboardStats(req.user.sub, req.user.institutionId);
  }

  @Post('sessions/:sessionId/warnings')
  async recordWarning(
    @Param('sessionId') sessionId: string,
    @Body() body: { type: string; message: string },
  ) {
    return this.examsService.recordWarning(sessionId, body.type, body.message);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('LECTURER', 'ADMIN')
  findAll(@Request() req: any) {
    return this.examsService.findAll(req.user.sub, req.user.institutionId);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('LECTURER', 'ADMIN')
  findOne(@Param('id') id: string, @Request() req: any) {
    return this.examsService.findOne(id, req.user.sub, req.user.institutionId);
  }

  @Patch(':id/publish')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('LECTURER', 'ADMIN')
  publish(@Param('id') id: string, @Request() req: any) {
    return this.examsService.publish(id, req.user.sub);
  }

  @Patch(':id/archive')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('LECTURER', 'ADMIN')
  archive(@Param('id') id: string, @Request() req: any) {
    return this.examsService.archive(id, req.user.sub);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('LECTURER', 'ADMIN')
  remove(@Param('id') id: string, @Request() req: any) {
    return this.examsService.remove(id, req.user.sub);
  }

  @Post('access/:accessCode/session')
  createSession(
    @Param('accessCode') accessCode: string,
    @Body() body: { name: string; studentNumber: string; password?: string },
  ) {
    return this.examsService.createSession(
      accessCode,
      body.name,
      body.studentNumber,
      body.password,
    );
  }

  @Post('access/:accessCode/submit-question')
  submitQuestion(
    @Param('accessCode') accessCode: string,
    @Body() body: { sessionId: string; questionId: string; answer: any },
  ) {
    return this.examsService.submitQuestion(
      accessCode,
      body.sessionId,
      body.questionId,
      body.answer,
    );
  }

  @Post('access/:accessCode/submit-exam')
  submitExam(
    @Param('accessCode') accessCode: string,
    @Body() body: { sessionId: string },
  ) {
    return this.examsService.submitExam(accessCode, body.sessionId);
  }

  @Post('access/:accessCode/log-event')
  logEvent(
    @Param('accessCode') accessCode: string,
    @Body() body: { sessionId: string; eventType: string; metadata?: string },
  ) {
    return this.examsService.logEvent(
      accessCode,
      body.sessionId,
      body.eventType,
      body.metadata,
    );
  }

  @Get(':id/sessions')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('LECTURER', 'ADMIN')
  getSessions(@Param('id') id: string, @Request() req: any) {
    return this.examsService.getSessions(id, req.user.sub);
  }

  @Get(':id/reports')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('LECTURER', 'ADMIN')
  getReports(@Param('id') id: string, @Request() req: any) {
    return this.examsService.getReports(id, req.user.sub);
  }

  @Post('access/:accessCode/sessions')
  getSessionsByAccessCode(
    @Param('accessCode') accessCode: string,
    @Body() body: { invigilatorPassword?: string },
  ) {
    return this.examsService.getSessionsByAccessCode(accessCode, body.invigilatorPassword);
  }

  @Get('access/:accessCode/sessions/:sessionId')
  getSessionDetails(
    @Param('accessCode') accessCode: string,
    @Param('sessionId') sessionId: string,
  ) {
    return this.examsService.getSessionWithSubmissions(accessCode, sessionId);
  }

  @Get(':id/export/excel')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('LECTURER', 'ADMIN')
  async exportExcel(@Param('id') id: string, @Request() req: any, @Res() res: Response) {
    const buffer = await this.examsService.exportToExcel(id, req.user.sub);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename=exam-results.xlsx',
    );
    res.send(buffer);
  }

  @Get(':id/export/html')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('LECTURER', 'ADMIN')
  async exportHtml(@Param('id') id: string, @Request() req: any, @Res() res: Response) {
    const html = await this.examsService.exportToHtml(id, req.user.sub);
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  }
}
