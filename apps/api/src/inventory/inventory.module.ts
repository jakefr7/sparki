import { Module } from '@nestjs/common';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { PurchasingService } from './purchasing.service';
import { CountsController } from './counts.controller';
import { CountsService } from './counts.service';
@Module({
  controllers: [InventoryController, CountsController],
  providers: [InventoryService, PurchasingService, CountsService],
  exports: [InventoryService, PurchasingService, CountsService],
})
export class InventoryModule {}
