import { Injectable, NotFoundException } from '@nestjs/common';
import { prisma } from '@sparki/db';
import type { CreateClientInput } from './dto/create-client.schema';

@Injectable()
export class ClientsService {
  async create(organizationId: string, input: CreateClientInput) {
    return prisma.client.create({
      data: {
        organizationId,
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email ?? null,
        phone: input.phone ?? null,
        preferredContactMethod: input.preferredContactMethod ?? null,
      },
    });
  }

  async findById(id: string, organizationId: string) {
    const client = await prisma.client.findFirst({ where: { id, organizationId } });
    if (!client) {
      throw new NotFoundException(`Client ${id} not found`);
    }
    return client;
  }
}
