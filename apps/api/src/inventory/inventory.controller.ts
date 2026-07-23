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
import { InventoryService } from './inventory.service';
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}
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
