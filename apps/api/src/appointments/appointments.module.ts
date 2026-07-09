import { Module } from '@nestjs/common';
import { SchedulerConfigModule } from '../scheduler-config/scheduler-config.module';
import { AppointmentsController } from './appointments.controller';
import { AppointmentsService } from './appointments.service';

@Module({
  imports: [SchedulerConfigModule],
  controllers: [AppointmentsController],
  providers: [AppointmentsService],
  exports: [AppointmentsService],
})
export class AppointmentsModule {}
