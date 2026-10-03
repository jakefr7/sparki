import { Module } from '@nestjs/common';
import { AddressModule } from './address/address.module';
import { AppConfigModule } from './config/app-config.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { AuthModule } from './auth/auth.module';
import { BillingModule } from './billing/billing.module';
import { ClientsModule } from './clients/clients.module';
import { ClientCommunicationModule } from './client-communication/client-communication.module';
import { ClinicModule } from './clinic/clinic.module';
import { DashboardStatusColorsModule } from './dashboard-status-colors/dashboard-status-colors.module';
import { HealthModule } from './health/health.module';
import { InvitationsModule } from './invitations/invitations.module';
import { NotesModule } from './notes/notes.module';
import { OperationsModule } from './operations/operations.module';
import { PatientsModule } from './patients/patients.module';
import { SchedulerConfigModule } from './scheduler-config/scheduler-config.module';
import { StaffModule } from './staff/staff.module';
import { TasksModule } from './tasks/tasks.module';
import { TeamModule } from './team/team.module';
import { VisitsModule } from './visits/visits.module';
import { MessagingModule } from './messaging/messaging.module';
import { InventoryModule } from './inventory/inventory.module';

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
    ClientCommunicationModule,
    InventoryModule,
    BillingModule,
    ClinicModule,
    InvitationsModule,
    TeamModule,
  ],
})
export class AppModule {}
