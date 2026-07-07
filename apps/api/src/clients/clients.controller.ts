import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ClientsService } from './clients.service';
import { createClientSchema, type CreateClientInput } from './dto/create-client.schema';
import { searchClientsQuerySchema, type SearchClientsQuery } from './dto/search-clients.schema';
import { updateClientSchema, type UpdateClientInput } from './dto/update-client.schema';

@Controller('clients')
export class ClientsController {
  constructor(private readonly clients: ClientsService) {}

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createClientSchema)) body: CreateClientInput,
  ) {
    return this.clients.create(user.organizationId, body);
  }

  // Must come before ':id' so it isn't matched as a client ID.
  @Get('search')
  search(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(searchClientsQuerySchema)) query: SearchClientsQuery,
  ) {
    return this.clients.search(user.organizationId, query.query, query.limit);
  }

  @Get(':id')
  findById(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.clients.findById(id, user.organizationId);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateClientSchema)) body: UpdateClientInput,
  ) {
    return this.clients.update(id, user.organizationId, body);
  }
}
