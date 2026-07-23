import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  activityQuerySchema,
  adjustmentSchema,
  inventoryQuerySchema,
  itemSchema,
  updateItemSchema,
  type ActivityQuery,
  type AdjustmentInput,
  type InventoryQuery,
  type ItemInput,
  type UpdateItemInput,
} from './dto/inventory.schema';
import { poSchema, poTransitionSchema, receiptSchema, transferSchema, vendorItemSchema, vendorSchema, vendorUpdateSchema, type POInput, type POTransition, type ReceiptInput, type TransferInput, type VendorInput, type VendorItemInput, type VendorUpdate } from './dto/purchasing.schema';
import { InventoryService } from './inventory.service';
import { PurchasingService } from './purchasing.service';
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventory: InventoryService, private readonly purchasing: PurchasingService) {}
  @Get('vendors') vendors(@CurrentUser() user: AuthenticatedUser) { return this.purchasing.vendors(user); }
  @Post('vendors') createVendor(@CurrentUser() user:AuthenticatedUser,@Body(new ZodValidationPipe(vendorSchema)) body:VendorInput){return this.purchasing.createVendor(user,body);}
  @Patch('vendors/:id') updateVendor(@CurrentUser() user:AuthenticatedUser,@Param('id') id:string,@Body(new ZodValidationPipe(vendorUpdateSchema)) body:VendorUpdate){return this.purchasing.updateVendor(user,id,body);}
  @Post('vendors/:id/archive') archiveVendor(@CurrentUser() user:AuthenticatedUser,@Param('id') id:string){return this.purchasing.archiveVendor(user,id);}
  @Post('vendors/:id/items') mapVendorItem(@CurrentUser() user:AuthenticatedUser,@Param('id') id:string,@Body(new ZodValidationPipe(vendorItemSchema)) body:VendorItemInput){return this.purchasing.mapVendorItem(user,id,body);}
  @Get('orders') orders(@CurrentUser() user:AuthenticatedUser){return this.purchasing.orders(user);}
  @Get('orders/:id') order(@CurrentUser() user:AuthenticatedUser,@Param('id') id:string){return this.purchasing.order(user,id);}
  @Post('orders') createOrder(@CurrentUser() user:AuthenticatedUser,@Body(new ZodValidationPipe(poSchema)) body:POInput){return this.purchasing.createOrder(user,body);}
  @Post('orders/:id/transition') transition(@CurrentUser() user:AuthenticatedUser,@Param('id') id:string,@Body(new ZodValidationPipe(poTransitionSchema)) body:POTransition){return this.purchasing.transition(user,id,body);}
  @Post('receipts') receive(@CurrentUser() user:AuthenticatedUser,@Body(new ZodValidationPipe(receiptSchema)) body:ReceiptInput){return this.purchasing.receive(user,body);}
  @Post('transfers') transfer(@CurrentUser() user:AuthenticatedUser,@Body(new ZodValidationPipe(transferSchema)) body:TransferInput){return this.purchasing.transfer(user,body);}
  @Get('purchasing-activity') purchasingActivity(@CurrentUser() user:AuthenticatedUser){return this.purchasing.events(user);}
  @Get('overview') overview(@CurrentUser() user: AuthenticatedUser) {
    return this.inventory.overview(user);
  }
  @Get('locations') locations(@CurrentUser() user: AuthenticatedUser) {
    return this.inventory.locations(user);
  }
  @Get('activity') activity(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(activityQuerySchema)) query: ActivityQuery,
  ) {
    return this.inventory.activity(user, query);
  }
  @Get('items') list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(inventoryQuerySchema)) query: InventoryQuery,
  ) {
    return this.inventory.list(user, query);
  }
  @Get('items/:id') get(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.inventory.get(user, id);
  }
  @Post('items') create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(itemSchema)) body: ItemInput,
  ) {
    return this.inventory.create(user, body);
  }
  @Patch('items/:id') update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateItemSchema)) body: UpdateItemInput,
  ) {
    return this.inventory.update(user, id, body);
  }
  @Post('items/:id/archive') archive(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.inventory.archive(user, id);
  }
  @Delete('items/:id') delete(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.inventory.delete(user, id);
  }
  @Post('adjustments') adjust(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(adjustmentSchema)) body: AdjustmentInput,
  ) {
    return this.inventory.adjust(user, body);
  }
}
