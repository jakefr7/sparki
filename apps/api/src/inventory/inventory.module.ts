import { Module } from '@nestjs/common';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { PurchasingService } from './purchasing.service';
import { CountsController } from './counts.controller';
import { CountsService } from './counts.service';
import { ControlledController } from './controlled.controller';
import { ControlledService } from './controlled.service';
import { ControlledCloseoutController } from './controlled-closeout.controller';
import { ControlledCloseoutService } from './controlled-closeout.service';
import { UsageController } from './usage.controller';
import { UsageService } from './usage.service';
@Module({
  controllers: [
    InventoryController,
    CountsController,
    ControlledController,
    ControlledCloseoutController,
    UsageController,
  ],
  providers: [
    InventoryService,
    PurchasingService,
    CountsService,
    ControlledService,
    ControlledCloseoutService,
    UsageService,
  ],
  exports: [
    InventoryService,
    PurchasingService,
    CountsService,
    ControlledService,
    ControlledCloseoutService,
    UsageService,
  ],
})
export class InventoryModule {}
