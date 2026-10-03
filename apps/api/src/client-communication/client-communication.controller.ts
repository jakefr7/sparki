import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../auth/current-user.decorator';
import { requireRole } from '../auth/require-role';
import type { AuthenticatedUser } from '../auth/types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CLIENT_COMMUNICATION_ROLES } from './client-communication.constants';
import { ClientCommunicationService } from './client-communication.service';
import {
  listMessagesQuerySchema,
  listThreadsQuerySchema,
  openThreadSchema,
  recordConsentSchema,
  sendMessageSchema,
  simulatedReplySchema,
  updateThreadSchema,
  type ListMessagesQuery,
  type ListThreadsQuery,
  type OpenThreadInput,
  type RecordConsentInput,
  type SendMessageInput,
  type SimulatedReplyInput,
  type UpdateThreadInput,
} from './dto/client-communication.schema';

/**
 * Staff-facing client texting. Every route requires a clinic staff role;
 * the response shapes are documented for the web app in
 * docs/engineering/client-communication-backend.md.
 */
@Controller('client-communication')
export class ClientCommunicationController {
  constructor(private readonly communication: ClientCommunicationService) {}

  @Get('readiness')
  readiness(@CurrentUser() user: AuthenticatedUser) {
    requireRole(user, CLIENT_COMMUNICATION_ROLES);
    return this.communication.readiness(user);
  }

  @Get('assignees')
  assignees(@CurrentUser() user: AuthenticatedUser) {
    requireRole(user, CLIENT_COMMUNICATION_ROLES);
    return this.communication.assignees(user);
  }

  @Get('threads')
  listThreads(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(listThreadsQuerySchema)) query: ListThreadsQuery,
  ) {
    requireRole(user, CLIENT_COMMUNICATION_ROLES);
    return this.communication.listThreads(user, query);
  }

  @Post('threads')
  async openThread(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(openThreadSchema)) body: OpenThreadInput,
    @Res({ passthrough: true }) response: Response,
  ) {
    requireRole(user, CLIENT_COMMUNICATION_ROLES);
    const result = await this.communication.openThread(user, body);
    response.status(result.created ? HttpStatus.CREATED : HttpStatus.OK);
    return result;
  }

  @Get('threads/:id')
  getThread(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    requireRole(user, CLIENT_COMMUNICATION_ROLES);
    return this.communication.getThread(user, id);
  }

  @Patch('threads/:id')
  updateThread(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateThreadSchema)) body: UpdateThreadInput,
  ) {
    requireRole(user, CLIENT_COMMUNICATION_ROLES);
    return this.communication.updateThread(user, id, body);
  }

  @Post('threads/:id/read')
  @HttpCode(HttpStatus.OK)
  markRead(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    requireRole(user, CLIENT_COMMUNICATION_ROLES);
    return this.communication.markRead(user, id);
  }

  @Post('threads/:id/unread')
  @HttpCode(HttpStatus.OK)
  markUnread(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    requireRole(user, CLIENT_COMMUNICATION_ROLES);
    return this.communication.markUnread(user, id);
  }

  @Get('threads/:id/messages')
  listMessages(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query(new ZodValidationPipe(listMessagesQuerySchema)) query: ListMessagesQuery,
  ) {
    requireRole(user, CLIENT_COMMUNICATION_ROLES);
    return this.communication.listMessages(user, id, query);
  }

  @Post('threads/:id/messages')
  async sendMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(sendMessageSchema)) body: SendMessageInput,
    @Res({ passthrough: true }) response: Response,
  ) {
    requireRole(user, CLIENT_COMMUNICATION_ROLES);
    const result = await this.communication.sendMessage(user, id, body);
    response.status(result.created ? HttpStatus.CREATED : HttpStatus.OK);
    return result;
  }

  @Put('threads/:id/consent')
  recordConsent(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(recordConsentSchema)) body: RecordConsentInput,
  ) {
    requireRole(user, CLIENT_COMMUNICATION_ROLES);
    return this.communication.recordConsent(user, id, body);
  }

  @Post('threads/:id/simulated-replies')
  simulateClientReply(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(simulatedReplySchema)) body: SimulatedReplyInput,
  ) {
    requireRole(user, CLIENT_COMMUNICATION_ROLES);
    return this.communication.simulateClientReply(user, id, body);
  }

  @Get('attachments/:id')
  @Header('Cache-Control', 'private, no-store')
  async downloadAttachment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Res() response: Response,
  ) {
    requireRole(user, CLIENT_COMMUNICATION_ROLES);
    const file = await this.communication.downloadAttachment(user, id);
    response.setHeader('Content-Type', file.mimeType);
    response.setHeader('Content-Length', String(file.body.length));
    // Client-supplied files are shown inline only as the image/PDF types the
    // dispatcher allowed; nosniff stops a browser from treating one as HTML,
    // and the sandbox keeps anything active inside one (a PDF's scripts) from
    // running with the app's origin.
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    );
    response.setHeader(
      'Content-Disposition',
      `inline; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
    );
    response.send(file.body);
  }
}
