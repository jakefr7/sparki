import { Module } from '@nestjs/common';
import { AppConfigModule } from './config/app-config.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { AuthModule } from './auth/auth.module';
import { ClientsModule } from './clients/clients.module';
import { HealthModule } from './health/health.module';
import { PatientsModule } from './patients/patients.module';
import { VisitsModule } from './visits/visits.module';

@Module({
  imports: [
    AppConfigModule,
    AuthModule,
    HealthModule,
    ClientsModule,
    AppointmentsModule,
    PatientsModule,
    VisitsModule,
  ],
})
export class AppModule {}
