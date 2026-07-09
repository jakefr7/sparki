import { Module } from '@nestjs/common';
import { DashboardStatusColorsController } from './dashboard-status-colors.controller';
import { DashboardStatusColorsService } from './dashboard-status-colors.service';

@Module({
  controllers: [DashboardStatusColorsController],
  providers: [DashboardStatusColorsService],
  exports: [DashboardStatusColorsService],
})
export class DashboardStatusColorsModule {}
