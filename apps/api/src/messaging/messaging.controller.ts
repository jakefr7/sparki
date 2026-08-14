import { Body, Controller, Delete, Get, Header, Param, Patch, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { createConversationSchema, createMessageSchema, reactionSchema, sendClientMessageSchema, updateMembershipSchema, updateMessageSchema, uploadAttachmentSchema, type CreateConversationInput, type CreateMessageInput, type UpdateMembershipInput, type UpdateMessageInput } from './dto/messaging.schema';
import { MessagingService } from './messaging.service';

@Controller('messaging')
export class MessagingController {
  constructor(private readonly messaging: MessagingService) {}

  @Get('directory') directory(@CurrentUser() user: AuthenticatedUser, @Query('search') search?: string) { return this.messaging.directory(user, search); }
  @Get('conversations') conversations(@CurrentUser() user: AuthenticatedUser, @Query('archived') archived?: string, @Query('search') search?: string) { return this.messaging.list(user, archived === 'true', search); }
  @Post('conversations') createConversation(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(createConversationSchema)) body: CreateConversationInput) { return this.messaging.createConversation(user, body); }
  @Get('conversations/:id/messages') messages(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Query('cursor') cursor?: string) { return this.messaging.messages(user, id, cursor); }
  @Post('conversations/:id/messages') createMessage(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body(new ZodValidationPipe(createMessageSchema)) body: CreateMessageInput) { return this.messaging.createMessage(user, id, body); }
  @Post('attachments') uploadAttachment(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(uploadAttachmentSchema)) body: { fileName: string; mimeType: string; contentBase64: string }) { return this.messaging.uploadAttachment(user, body); }
  @Get('attachments/:id')
  @Header('Cache-Control', 'private, no-store')
  async downloadAttachment(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Res() response: Response) {
    const file = await this.messaging.downloadAttachment(user, id);
    response.setHeader('Content-Type', file.mimeType);
    response.setHeader('Content-Length', String(file.body.length));
    response.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`);
    response.send(file.body);
  }
  @Patch('conversations/:id/membership') membership(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body(new ZodValidationPipe(updateMembershipSchema)) body: UpdateMembershipInput) { return this.messaging.updateMembership(user, id, body); }
  @Patch('messages/:id') updateMessage(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body(new ZodValidationPipe(updateMessageSchema)) body: UpdateMessageInput) { return this.messaging.updateMessage(user, id, body); }
  @Post('messages/:id/reactions') reaction(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body(new ZodValidationPipe(reactionSchema)) body: { emoji: string }) { return this.messaging.toggleReaction(user, id, body.emoji); }
  @Delete('messages/:id/reactions/:emoji') removeReaction(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Param('emoji') emoji: string) { return this.messaging.removeReaction(user, id, decodeURIComponent(emoji)); }
  @Get('client-threads') clientThreads(@CurrentUser() user: AuthenticatedUser, @Query('search') search?: string) { return this.messaging.clientThreads(user, search); }
  @Get('client-threads/:id') clientThread(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.messaging.clientThread(user, id); }
  @Post('client-threads/:id/messages') sendClientMessage(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body(new ZodValidationPipe(sendClientMessageSchema)) body: { body: string }) { return this.messaging.sendClientMessage(user, id, body.body); }
  @Patch('client-threads/:id') updateClientThread(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: { status?: 'OPEN' | 'WAITING' | 'CLOSED'; isUnread?: boolean }) { return this.messaging.updateClientThread(user, id, body); }
}
