import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { prisma } from '@sparki/db';
import { z } from 'zod';
import { AttachmentStorageService } from '../messaging/attachment-storage.service';
import type { AuthenticatedUser } from './types';

export const MAX_PROFILE_IMAGE_BYTES = 5 * 1024 * 1024;
export const uploadProfileAvatarSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
  contentBase64: z.string().min(1).max(Math.ceil(MAX_PROFILE_IMAGE_BYTES / 3) * 4),
});

function matchesImage(body: Buffer, mimeType: string): boolean {
  if (mimeType === 'image/jpeg') return body.length >= 3 && body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff;
  if (mimeType === 'image/png') return body.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mimeType === 'image/gif') return ['GIF87a', 'GIF89a'].includes(body.subarray(0, 6).toString('ascii'));
  return body.length >= 12 && body.subarray(0, 4).toString('ascii') === 'RIFF' && body.subarray(8, 12).toString('ascii') === 'WEBP';
}

@Injectable()
export class ProfileAvatarService {
  constructor(private readonly storage: AttachmentStorageService) {}

  private key(organizationId: string, userId: string, imageId: string) {
    return `organizations/${organizationId}/users/${userId}/profile/${imageId}`;
  }

  private url(userId: string, imageId: string) {
    return `/api/auth/profile/avatar/${encodeURIComponent(userId)}/${imageId}`;
  }

  async upload(user: AuthenticatedUser, input: z.infer<typeof uploadProfileAvatarSchema>) {
    const body = Buffer.from(input.contentBase64, 'base64');
    if (!body.length || body.toString('base64').replace(/=+$/, '') !== input.contentBase64.replace(/=+$/, '')) {
      throw new BadRequestException('Choose a valid image file.');
    }
    if (body.length > MAX_PROFILE_IMAGE_BYTES) throw new BadRequestException('Profile image must be 5 MB or smaller.');
    if (!matchesImage(body, input.mimeType)) throw new BadRequestException('Image content does not match its declared type.');
    const imageId = randomUUID();
    const key = this.key(user.organizationId, user.id, imageId);
    await this.storage.put(key, body, input.mimeType, input.fileName);
    try {
      return await prisma.user.update({ where: { id: user.id, organizationId: user.organizationId }, data: { avatarUrl: this.url(user.id, imageId) }, select: profileFields });
    } catch (caught) {
      await this.storage.remove(key).catch(() => {});
      throw caught;
    }
  }

  async remove(user: AuthenticatedUser) {
    return prisma.user.update({ where: { id: user.id, organizationId: user.organizationId }, data: { avatarUrl: null }, select: profileFields });
  }

  async content(user: AuthenticatedUser, ownerId: string, imageId: string) {
    if (!/^[a-zA-Z0-9_-]+$/.test(ownerId) || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(imageId)) throw new NotFoundException('Profile image not found.');
    const owner = await prisma.user.findFirst({ where: {
      id: ownerId, organizationId: user.organizationId,
      ...(ownerId === user.id ? {} : { clinicLocationAccess: { some: { organizationId: user.organizationId, clinicLocationId: user.locationId, isActive: true } } }),
    }, select: { avatarUrl: true } });
    if (owner?.avatarUrl !== this.url(ownerId, imageId)) throw new NotFoundException('Profile image not found.');
    try {
      return await this.storage.get(this.key(user.organizationId, ownerId, imageId));
    } catch (caught) {
      if ((caught as NodeJS.ErrnoException).code === 'ENOENT') throw new NotFoundException('Profile image not found.');
      throw caught;
    }
  }
}

const profileFields = { id: true, email: true, phone: true, firstName: true, lastName: true, displayName: true, avatarUrl: true, statusEmoji: true, statusText: true, role: true } as const;
