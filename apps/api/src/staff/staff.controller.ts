import { Body, Controller, Get, Param, Put, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { listStaffQuerySchema, type ListStaffQuery } from './dto/list-staff.schema';
import { updateRecordSignoffPermissionSchema, type UpdateRecordSignoffPermissionInput } from './dto/update-record-signoff-permission.schema';
import { updateMedicationPermissionSchema, type UpdateMedicationPermissionInput } from './dto/update-medication-permission.schema';
import { requireAdminSettingsManager } from '../auth/permissions';
import { StaffService } from './staff.service';

@Controller('staff')
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(listStaffQuerySchema)) query: ListStaffQuery,
  ) {
    return this.staff.list(user.organizationId, user.locationId, query);
  }

  @Get(':id')
  findById(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.staff.findById(id, user.organizationId, user.locationId);
  }

  @Put(':id/record-signoff-permission')
  updateRecordSignoffPermission(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateRecordSignoffPermissionSchema)) body: UpdateRecordSignoffPermissionInput,
  ) {
    requireAdminSettingsManager(user);
    return this.staff.updateRecordSignoffPermission(id, user, body.canFinalizeRecordsForOthers);
  }

  @Put(':id/medication-permission')
  updateMedicationPermission(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateMedicationPermissionSchema)) body: UpdateMedicationPermissionInput,
  ) {
    requireAdminSettingsManager(user);
    return this.staff.updateMedicationPermission(id, user, body.canManageMedications);
  }
}
