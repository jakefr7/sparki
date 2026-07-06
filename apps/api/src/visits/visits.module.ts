import { Module } from '@nestjs/common';
import { AppointmentsModule } from '../appointments/appointments.module';
import { PatientsModule } from '../patients/patients.module';
import { VisitsController } from './visits.controller';
import { VisitsService } from './visits.service';

@Module({
  imports: [PatientsModule, AppointmentsModule],
  controllers: [VisitsController],
  providers: [VisitsService],
})
export class VisitsModule {}
