import { Module } from '@nestjs/common';
import { MessagingController } from './messaging.controller';
import { MessagingService } from './messaging.service';
import { AttachmentStorageService } from './attachment-storage.service';
@Module({ controllers: [MessagingController], providers: [MessagingService, AttachmentStorageService] })
export class MessagingModule {}
