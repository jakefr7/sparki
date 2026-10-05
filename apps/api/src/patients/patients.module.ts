import { PatientPrescriptionsController } from './patient-prescriptions.controller';
import { PatientPrescriptionsService } from './patient-prescriptions.service';
import { PatientFasController } from './patient-fas.controller';
import { PatientFasService } from './patient-fas.service';
import { Module } from '@nestjs/common';
import { AppointmentsModule } from '../appointments/appointments.module';
import { MessagingModule } from '../messaging/messaging.module';
import { PatientsController } from './patients.controller';
import { PatientsService } from './patients.service';

@Module({
  imports: [AppointmentsModule, MessagingModule],
  controllers: [PatientsController, PatientPrescriptionsController, PatientFasController],
  providers: [PatientsService, PatientPrescriptionsService, PatientFasService],
  exports: [PatientsService],
})
export class PatientsModule {}
