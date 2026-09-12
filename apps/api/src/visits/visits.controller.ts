import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { requireRole } from '../auth/require-role';
import type { AuthenticatedUser } from '../auth/types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { createVisitSchema, type CreateVisitInput } from './dto/create-visit.schema';
import { deferEmergencyIntakeSchema, type DeferEmergencyIntakeInput } from './dto/defer-emergency-intake.schema';
import { saveExamFindingsSchema, type SaveExamFindingsInput } from './dto/save-exam-findings.schema';
import { saveVisitIntakeSchema, type SaveVisitIntakeInput } from './dto/save-visit-intake.schema';
import { setDashboardStatusSchema, type SetDashboardStatusInput } from './dto/set-dashboard-status.schema';
import {
  amendVisitRecordSchema,
  delegateVisitSignoffSchema,
  saveVisitRecordDraftSchema,
  type AmendVisitRecordInput,
  type DelegateVisitSignoffInput,
  type SaveVisitRecordDraftInput,
} from './dto/visit-record.schema';
import { VisitRecordsService } from './visit-records.service';
import {
  completeVisitCheckoutSchema,
  saveVisitDischargeSchema,
  updateVisitBalanceSchema,
  type CompleteVisitCheckoutInput,
  type SaveVisitDischargeInput,
  type UpdateVisitBalanceInput,
} from './dto/visit-discharge.schema';
import { VisitDischargeService } from './visit-discharge.service';
import { VisitsService } from './visits.service';
import { createVisitWorkItemSchema, updateVisitWorkItemSchema, type CreateVisitWorkItemInput, type UpdateVisitWorkItemInput } from './dto/visit-work-item.schema';
import { VisitWorkItemsService } from './visit-work-items.service';
import {
  addInvoiceLineSchema,
  recordExternalPaymentSchema,
  voidInvoiceSchema,
  type AddInvoiceLineInput,
  type RecordExternalPaymentInput,
  type VoidInvoiceInput,
} from './dto/visit-billing.schema';
import { VisitBillingService } from './visit-billing.service';

@Controller('visits')
export class VisitsController {
  constructor(
    private readonly visits: VisitsService,
    private readonly records: VisitRecordsService,
    private readonly discharge: VisitDischargeService,
    private readonly workItems: VisitWorkItemsService,
    private readonly billing: VisitBillingService,
  ) {}

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createVisitSchema)) body: CreateVisitInput,
  ) {
    return this.visits.create(user.organizationId, user.locationId, user.id, body);
  }

  @Get(':id')
  findById(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.visits.findById(id, user.organizationId, user.locationId);
  }

  @Post(':id/start')
  start(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    requireRole(user, ['OWNER', 'VETERINARIAN', 'TECHNICIAN', 'ASSISTANT']);
    return this.visits.start(id, user.organizationId, user.locationId, user.id, user.role);
  }

  @Post(':id/dashboard-status')
  setDashboardStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(setDashboardStatusSchema)) body: SetDashboardStatusInput,
  ) {
    requireRole(user, ['OWNER', 'PRACTICE_MANAGER', 'RECEPTIONIST', 'VETERINARIAN', 'TECHNICIAN', 'ASSISTANT']);
    return this.visits.setDashboardStatus(id, user.organizationId, user.locationId, user.id, user.role, body.statusKey);
  }

  @Put(':id/intake')
  saveIntake(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(saveVisitIntakeSchema)) body: SaveVisitIntakeInput,
  ) {
    requireRole(user, ['OWNER', 'VETERINARIAN', 'TECHNICIAN', 'ASSISTANT']);
    return this.visits.saveIntake(id, user.organizationId, user.locationId, user.id, body);
  }

  @Post(':id/intake/complete')
  completeIntake(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    requireRole(user, ['OWNER', 'VETERINARIAN', 'TECHNICIAN', 'ASSISTANT']);
    return this.visits.completeIntake(id, user.organizationId, user.locationId, user.id, user.role);
  }

  @Post(':id/intake/defer-emergency')
  deferEmergencyIntake(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(deferEmergencyIntakeSchema)) body: DeferEmergencyIntakeInput,
  ) {
    requireRole(user, ['OWNER', 'VETERINARIAN', 'TECHNICIAN', 'ASSISTANT']);
    return this.visits.deferEmergencyIntake(
      id,
      user.organizationId,
      user.locationId,
      user.id,
      user.role,
      body.reason,
    );
  }

  @Post(':id/exam/start')
  startExam(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    requireRole(user, ['VETERINARIAN', 'OWNER']);
    return this.visits.startExam(id, user.organizationId, user.locationId, user.id, user.role);
  }

  @Put(':id/exam-findings')
  saveExamFindings(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(saveExamFindingsSchema)) body: SaveExamFindingsInput,
  ) {
    requireRole(user, ['VETERINARIAN', 'OWNER']);
    return this.visits.saveExamFindings(id, user.organizationId, user.locationId, user.id, body);
  }

  // Clinical exam completion is veterinarian-owned per
  // docs/blueprint/11-permission-and-ownership-v1.md ("Veterinarian owns
  // Clinical Decisions... Medical Record content requires clinical
  // accountability"); OWNER retains it as the highest-access role.
  @Post(':id/exam/complete')
  completeExam(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    requireRole(user, ['VETERINARIAN', 'OWNER']);
    return this.visits.completeExam(id, user.organizationId, user.locationId, user.id, user.role);
  }

  @Get('records/open/mine')
  openRecords(@CurrentUser() user: AuthenticatedUser) {
    requireRole(user, ['VETERINARIAN', 'TECHNICIAN', 'ASSISTANT', 'OWNER']);
    return this.records.listOpenForUser(user.organizationId, user.locationId, user.id);
  }

  @Get('records/open')
  openLocationRecords(@CurrentUser() user: AuthenticatedUser) {
    requireRole(user, ['PRACTICE_MANAGER', 'OWNER']);
    return this.records.listOpenForLocation(user.organizationId, user.locationId);
  }

  @Put(':id/record/draft')
  saveRecordDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(saveVisitRecordDraftSchema)) body: SaveVisitRecordDraftInput,
  ) {
    requireRole(user, ['VETERINARIAN', 'TECHNICIAN', 'ASSISTANT', 'OWNER']);
    return this.records.saveDraft(id, user.organizationId, user.locationId, user.id, body);
  }

  @Post(':id/record/delegate')
  delegateRecordSignoff(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(delegateVisitSignoffSchema)) body: DelegateVisitSignoffInput,
  ) {
    requireRole(user, ['VETERINARIAN', 'OWNER', 'PRACTICE_MANAGER']);
    return this.records.delegate(id, user.organizationId, user.locationId, user.id, user.role, body.delegateId);
  }

  @Post(':id/record/finalize')
  finalizeRecord(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    requireRole(user, ['VETERINARIAN', 'TECHNICIAN', 'ASSISTANT', 'OWNER']);
    return this.records.finalize(id, user.organizationId, user.locationId, user.id);
  }

  @Post(':id/record/amend')
  amendRecord(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(amendVisitRecordSchema)) body: AmendVisitRecordInput,
  ) {
    requireRole(user, ['VETERINARIAN', 'TECHNICIAN', 'ASSISTANT', 'OWNER']);
    return this.records.amend(id, user.organizationId, user.locationId, user.id, body);
  }

  @Put(':id/discharge')
  saveDischarge(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(saveVisitDischargeSchema)) body: SaveVisitDischargeInput,
  ) {
    requireRole(user, ['OWNER', 'VETERINARIAN', 'TECHNICIAN', 'ASSISTANT']);
    return this.discharge.saveDischarge(id, user.organizationId, user.locationId, user.id, body);
  }

  @Post(':id/checkout/complete')
  completeCheckout(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(completeVisitCheckoutSchema)) body: CompleteVisitCheckoutInput,
  ) {
    requireRole(user, ['OWNER', 'PRACTICE_MANAGER', 'RECEPTIONIST']);
    return this.discharge.completeCheckout(id, user.organizationId, user.locationId, user.id, user.role, body);
  }

  @Post(':id/checkout/update-balance')
  updateOutstandingBalance(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body(new ZodValidationPipe(updateVisitBalanceSchema)) body: UpdateVisitBalanceInput) {
    requireRole(user, ['OWNER', 'PRACTICE_MANAGER', 'RECEPTIONIST']);
    return this.discharge.updateOutstandingBalance(id, user.organizationId, user.locationId, user.id, user.role, body);
  }

  @Post(':id/work-items')
  createWorkItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(createVisitWorkItemSchema)) body: CreateVisitWorkItemInput,
  ) {
    requireRole(user, ['OWNER', 'PRACTICE_MANAGER', 'RECEPTIONIST', 'VETERINARIAN', 'TECHNICIAN', 'ASSISTANT']);
    return this.workItems.create(id, user.organizationId, user.locationId, user.id, user.role, body);
  }

  @Put(':id/work-items/:itemId')
  updateWorkItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body(new ZodValidationPipe(updateVisitWorkItemSchema)) body: UpdateVisitWorkItemInput,
  ) {
    requireRole(user, ['OWNER', 'PRACTICE_MANAGER', 'RECEPTIONIST', 'VETERINARIAN', 'TECHNICIAN', 'ASSISTANT']);
    return this.workItems.update(id, itemId, user.organizationId, user.locationId, user.id, user.role, body);
  }

  // --- Checkout billing: invoice, invoice lines, and externally-recorded
  // payments (see VisitBillingService for the financial model). Sparki does
  // not process cards here — every payment below is staff confirming an
  // amount was already collected through the clinic's own terminal/processor.

  @Get(':id/checkout')
  getCheckoutState(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    requireRole(user, ['OWNER', 'PRACTICE_MANAGER', 'RECEPTIONIST']);
    return this.billing.getCheckoutState(id, user.organizationId, user.locationId, user.id);
  }

  @Get(':id/invoice')
  getInvoice(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    requireRole(user, ['OWNER', 'PRACTICE_MANAGER', 'RECEPTIONIST']);
    return this.billing.getInvoice(id, user.organizationId, user.locationId, user.id);
  }

  @Post(':id/invoice/void')
  voidInvoice(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(voidInvoiceSchema)) body: VoidInvoiceInput,
  ) {
    requireRole(user, ['OWNER', 'PRACTICE_MANAGER', 'RECEPTIONIST']);
    return this.billing.voidInvoice(id, user.organizationId, user.locationId, user.id, body.reason);
  }

  @Post(':id/invoice/lines')
  addInvoiceLine(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(addInvoiceLineSchema)) body: AddInvoiceLineInput,
  ) {
    requireRole(user, ['OWNER', 'PRACTICE_MANAGER', 'RECEPTIONIST']);
    return this.billing.addLine(id, user.organizationId, user.locationId, user.id, body);
  }

  @Delete(':id/invoice/lines/:lineId')
  removeInvoiceLine(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Param('lineId') lineId: string) {
    requireRole(user, ['OWNER', 'PRACTICE_MANAGER', 'RECEPTIONIST']);
    return this.billing.removeLine(id, lineId, user.organizationId, user.locationId);
  }

  @Post(':id/invoice/finalize')
  finalizeInvoice(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    requireRole(user, ['OWNER', 'PRACTICE_MANAGER', 'RECEPTIONIST']);
    return this.billing.finalizeInvoice(id, user.organizationId, user.locationId, user.id);
  }

  @Get(':id/invoice/receipt')
  getReceipt(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    requireRole(user, ['OWNER', 'PRACTICE_MANAGER', 'RECEPTIONIST']);
    return this.billing.getReceipt(id, user.organizationId, user.locationId);
  }

  @Get(':id/invoice/payments')
  getPaymentHistory(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    requireRole(user, ['OWNER', 'PRACTICE_MANAGER', 'RECEPTIONIST']);
    return this.billing.getPaymentHistory(id, user.organizationId, user.locationId);
  }

  @Post(':id/invoice/payments')
  recordExternalPayment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(recordExternalPaymentSchema)) body: RecordExternalPaymentInput,
  ) {
    requireRole(user, ['OWNER', 'PRACTICE_MANAGER', 'RECEPTIONIST']);
    return this.billing.recordExternalPayment(id, user.organizationId, user.locationId, user.id, body);
  }
}
