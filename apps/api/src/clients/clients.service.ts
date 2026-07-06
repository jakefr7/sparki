import { Injectable, NotFoundException } from '@nestjs/common';
import { prisma } from '@sparki/db';
import type { CreateClientInput } from './dto/create-client.schema';

export interface ClientSearchResult {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  preferredContactMethod: string | null;
}

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

  /**
   * Fuzzy match on firstName/lastName (backed by the Client_displayName_idx
   * trigram GIN index), plus substring match on phone/email — same shape as
   * PatientsService.search's client-join branch, but scoped to clients with
   * or without any Patient yet (front desk "existing client" lookup).
   */
  async search(organizationId: string, query: string, limit: number): Promise<ClientSearchResult[]> {
    return prisma.$queryRaw<ClientSearchResult[]>`
      SELECT id, "firstName", "lastName", phone, email, "preferredContactMethod"
      FROM "Client"
      WHERE "organizationId" = ${organizationId}
        AND (
          ("firstName" || ' ' || "lastName") ILIKE '%' || ${query} || '%'
          OR ("firstName" || ' ' || "lastName") % ${query}
          OR phone ILIKE '%' || ${query} || '%'
          OR email ILIKE '%' || ${query} || '%'
        )
      ORDER BY similarity(lower("firstName" || ' ' || "lastName"), lower(${query})) DESC
      LIMIT ${limit}
    `;
  }
}
