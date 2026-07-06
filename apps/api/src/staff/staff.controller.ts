import { Controller, Get, Param, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { listStaffQuerySchema, type ListStaffQuery } from './dto/list-staff.schema';
import { StaffService } from './staff.service';

@Controller('staff')
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(listStaffQuerySchema)) query: ListStaffQuery,
  ) {
    return this.staff.list(user.organizationId, query);
  }

  @Get(':id')
  findById(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.staff.findById(id, user.organizationId);
  }
}
