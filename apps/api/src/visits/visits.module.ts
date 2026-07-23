import { Module } from '@nestjs/common';
import { AppointmentsModule } from '../appointments/appointments.module';
import { PatientsModule } from '../patients/patients.module';
import { VisitsController } from './visits.controller';
import { VisitLifecycleService } from './visit-lifecycle.service';
import { VisitRecordsService } from './visit-records.service';
import { VisitDischargeService } from './visit-discharge.service';
import { VisitPolicyController } from './visit-policy.controller';
import { VisitWorkItemsService } from './visit-work-items.service';
import { VisitsService } from './visits.service';
import { InventoryModule } from '../inventory/inventory.module';

@Module({
  imports: [PatientsModule, AppointmentsModule, InventoryModule],
  controllers: [VisitsController, VisitPolicyController],
  providers: [
    VisitsService,
    VisitLifecycleService,
    VisitRecordsService,
    VisitDischargeService,
    VisitWorkItemsService,
  ],
  exports: [VisitsService],
})
export class VisitsModule {}
