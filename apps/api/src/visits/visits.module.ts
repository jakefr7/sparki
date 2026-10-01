import { VisitDocumentsController } from './visit-documents.controller';
import { VisitDocumentsService } from './visit-documents.service';
import { Module } from '@nestjs/common';
import { AppointmentsModule } from '../appointments/appointments.module';
import { PatientsModule } from '../patients/patients.module';
import { VisitsController } from './visits.controller';
import { VisitLifecycleService } from './visit-lifecycle.service';
import { VisitRecordsService } from './visit-records.service';
import { VisitDischargeService } from './visit-discharge.service';
import { VisitBillingService } from './visit-billing.service';
import { VisitPolicyController } from './visit-policy.controller';
import { VisitWorkItemsService } from './visit-work-items.service';
import { VisitsService } from './visits.service';
import { InventoryModule } from '../inventory/inventory.module';
import { MessagingModule } from '../messaging/messaging.module';
import { ClinicalAttachmentsController } from './clinical-attachments.controller';
import { ClinicalAttachmentsService } from './clinical-attachments.service';
import { PatientBillingController } from './patient-billing.controller';

@Module({
  imports: [PatientsModule, AppointmentsModule, InventoryModule, MessagingModule],
  controllers: [VisitDocumentsController, VisitsController, VisitPolicyController, ClinicalAttachmentsController, PatientBillingController],
  providers: [
    VisitsService,
    VisitDocumentsService,
    VisitLifecycleService,
    VisitRecordsService,
    VisitDischargeService,
    VisitBillingService,
    VisitWorkItemsService,
    ClinicalAttachmentsService,
  ],
  exports: [VisitsService],
})
export class VisitsModule {}
