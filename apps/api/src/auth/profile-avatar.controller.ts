import { Body, Controller, Delete, Get, Param, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentUser } from './current-user.decorator';
import { ProfileAvatarService, uploadProfileAvatarSchema } from './profile-avatar.service';
import type { AuthenticatedUser } from './types';
import { AllowInactiveClinic } from './allow-inactive-clinic.decorator';

@AllowInactiveClinic()
@Controller('auth/profile/avatar')
export class ProfileAvatarController {
  constructor(private readonly avatars: ProfileAvatarService) {}

  @Post()
  upload(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(uploadProfileAvatarSchema)) body: z.infer<typeof uploadProfileAvatarSchema>) {
    return this.avatars.upload(user, body);
  }

  @Delete()
  remove(@CurrentUser() user: AuthenticatedUser) { return this.avatars.remove(user); }

  @Get(':ownerId/:imageId')
  async content(@CurrentUser() user: AuthenticatedUser, @Param('ownerId') ownerId: string, @Param('imageId') imageId: string, @Res() response: Response) {
    const file = await this.avatars.content(user, ownerId, imageId);
    response.setHeader('Content-Type', file.contentType);
    response.setHeader('Content-Length', String(file.body.length));
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.send(file.body);
  }
}
