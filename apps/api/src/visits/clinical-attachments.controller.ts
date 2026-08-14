import { Body, Controller, Get, Param, Post, Put, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ClinicalAttachmentsService } from './clinical-attachments.service';
import { removeClinicalAttachmentSchema, uploadClinicalAttachmentSchema, type RemoveClinicalAttachmentInput, type UploadClinicalAttachmentInput } from './dto/clinical-attachment.schema';

@Controller('clinical-attachments')
export class ClinicalAttachmentsController {
  constructor(private readonly attachments: ClinicalAttachmentsService) {}
  @Post() upload(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(uploadClinicalAttachmentSchema)) body: UploadClinicalAttachmentInput) { return this.attachments.upload(user, body); }
  @Get(':id/content') async download(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Res() response: Response) { const file = await this.attachments.download(user, id); response.setHeader('Content-Type', file.contentType); response.setHeader('Content-Length', String(file.body.length)); response.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`); response.send(file.body); }
  @Put(':id/remove') remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body(new ZodValidationPipe(removeClinicalAttachmentSchema)) body: RemoveClinicalAttachmentInput) { return this.attachments.remove(user, id, body); }
}
