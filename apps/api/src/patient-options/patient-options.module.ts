import { Module } from '@nestjs/common';
import { PatientOptionsController } from './patient-options.controller';
import { PatientOptionsService } from './patient-options.service';
@Module({ controllers: [PatientOptionsController], providers: [PatientOptionsService] })
export class PatientOptionsModule {}
