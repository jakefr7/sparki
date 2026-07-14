import { Module } from '@nestjs/common';
import { SchedulerConfigModule } from '../scheduler-config/scheduler-config.module';
import { AppointmentsController } from './appointments.controller';
import { AppointmentsService } from './appointments.service';
import { AppointmentAvailabilityService } from './appointment-availability.service';

@Module({
  imports: [SchedulerConfigModule],
  controllers: [AppointmentsController],
  providers: [AppointmentsService, AppointmentAvailabilityService],
  exports: [AppointmentsService],
})
export class AppointmentsModule {}
