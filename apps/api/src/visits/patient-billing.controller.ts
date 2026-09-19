import { Controller, Get, Param } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types';
import { VisitBillingService } from './visit-billing.service';

@Controller('patients')
export class PatientBillingController {
  constructor(private readonly billing: VisitBillingService) {}

  @Get(':id/invoices')
  listInvoices(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.billing.listForPatient(id, user.organizationId, user.locationId);
  }
}
