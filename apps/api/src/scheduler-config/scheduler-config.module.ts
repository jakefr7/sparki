import { Module } from '@nestjs/common';
import { SchedulerConfigController } from './scheduler-config.controller';
import { SchedulerConfigService } from './scheduler-config.service';

@Module({
  controllers: [SchedulerConfigController],
  providers: [SchedulerConfigService],
  exports: [SchedulerConfigService],
})
export class SchedulerConfigModule {}
