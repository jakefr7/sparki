import { Module } from '@nestjs/common';
import { AddressModule } from './address/address.module';
import { AppConfigModule } from './config/app-config.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { AuthModule } from './auth/auth.module';
import { ClientsModule } from './clients/clients.module';
import { HealthModule } from './health/health.module';
import { OperationsModule } from './operations/operations.module';
import { PatientsModule } from './patients/patients.module';
import { StaffModule } from './staff/staff.module';
import { VisitsModule } from './visits/visits.module';

@Module({
  imports: [
    AppConfigModule,
    AuthModule,
    HealthModule,
    ClientsModule,
    AppointmentsModule,
    PatientsModule,
    StaffModule,
    VisitsModule,
    OperationsModule,
    AddressModule,
  ],
})
export class AppModule {}
