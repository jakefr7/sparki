import { Injectable, NotFoundException } from '@nestjs/common';
import { prisma } from '@sparki/db';
import { clientFuzzyMatchCondition, clientNameSimilarity } from '../common/client-fuzzy-match.sql';
import type { CreateClientInput } from './dto/create-client.schema';
import type { UpdateClientInput } from './dto/update-client.schema';

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
        alternatePhone: input.alternatePhone ?? null,
        preferredContactMethod: input.preferredContactMethod ?? null,
        addressLine1: input.addressLine1 ?? null,
        addressLine2: input.addressLine2 ?? null,
        city: input.city ?? null,
        state: input.state ?? null,
        postalCode: input.postalCode ?? null,
        country: input.country ?? null,
        formattedAddress: input.formattedAddress ?? null,
        addressPlaceId: input.addressPlaceId ?? null,
        addressLatitude: input.addressLatitude ?? null,
        addressLongitude: input.addressLongitude ?? null,
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

  async update(id: string, organizationId: string, input: UpdateClientInput) {
    const existing = await this.findById(id, organizationId);
    const data = Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));

    return prisma.$transaction(async (tx) => {
      const updated = await tx.client.update({ where: { id }, data });

      // Pet last name is inherited from the owner (see PatientsService.create)
      // and never edited directly, so keep it in sync here — but only for
      // patients whose lastName still matches the old owner name or was
      // never set. A patient whose lastName was manually changed to
      // something else (record correction, blended family, etc.) is left
      // alone rather than silently overwritten.
      if (input.lastName !== undefined && input.lastName !== existing.lastName) {
        await tx.patient.updateMany({
          where: {
            organizationId,
            OR: [{ lastName: existing.lastName }, { lastName: null }],
            clients: { some: { clientId: id, isPrimary: true } },
          },
          data: { lastName: input.lastName },
        });
      }

      return updated;
    });
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
        AND ${clientFuzzyMatchCondition('', query)}
      ORDER BY ${clientNameSimilarity('', query)} DESC
      LIMIT ${limit}
    `;
  }
}
