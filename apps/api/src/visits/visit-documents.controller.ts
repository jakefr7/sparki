import { Controller, Get, Param, Res, BadRequestException } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types';
import { VisitDocumentsService } from './visit-documents.service';

@Controller('visits')
export class VisitDocumentsController {
  constructor(private readonly documents: VisitDocumentsService) {}

  @Get(':id/documents/:kind')
  async download(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Param('kind') kind: string, @Res() response: Response) {
    if (kind !== 'record' && kind !== 'discharge' && kind !== 'receipt') throw new BadRequestException('Unknown document type.');
    const file = await this.documents.generate(user, id, kind);
    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`);
    response.setHeader('Cache-Control', 'private, no-store');
    response.send(file.body);
  }
}
