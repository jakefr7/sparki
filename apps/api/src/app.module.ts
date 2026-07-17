import { Module } from '@nestjs/common';
import { AddressModule } from './address/address.module';
import { AppConfigModule } from './config/app-config.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { AuthModule } from './auth/auth.module';
import { ClientsModule } from './clients/clients.module';
import { DashboardStatusColorsModule } from './dashboard-status-colors/dashboard-status-colors.module';
import { HealthModule } from './health/health.module';
import { NotesModule } from './notes/notes.module';
import { OperationsModule } from './operations/operations.module';
import { PatientsModule } from './patients/patients.module';
import { SchedulerConfigModule } from './scheduler-config/scheduler-config.module';
import { StaffModule } from './staff/staff.module';
import { TasksModule } from './tasks/tasks.module';
import { VisitsModule } from './visits/visits.module';
import { MessagingModule } from './messaging/messaging.module';

@Module({
  imports: [
    AppConfigModule,
    AuthModule,
    HealthModule,
    ClientsModule,
    AppointmentsModule,
    PatientsModule,
    SchedulerConfigModule,
    DashboardStatusColorsModule,
    NotesModule,
    TasksModule,
    StaffModule,
    VisitsModule,
    OperationsModule,
    AddressModule,
    MessagingModule,
  ],
})
export class AppModule {}
