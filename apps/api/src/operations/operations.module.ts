import { Module } from '@nestjs/common';
import { AppointmentsModule } from '../appointments/appointments.module';
import { VisitsModule } from '../visits/visits.module';
import { OperationsController } from './operations.controller';
import { OperationsService } from './operations.service';

@Module({
  imports: [AppointmentsModule, VisitsModule],
  controllers: [OperationsController],
  providers: [OperationsService],
})
export class OperationsModule {}
