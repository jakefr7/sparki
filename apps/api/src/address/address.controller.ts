import { Controller, Get, Query, ServiceUnavailableException } from '@nestjs/common';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AddressService } from './address.service';
import {
  addressAutocompleteQuerySchema,
  type AddressAutocompleteQuery,
} from './dto/address-autocomplete-query.schema';
import { addressDetailsQuerySchema, type AddressDetailsQuery } from './dto/address-details-query.schema';

@Controller('address')
export class AddressController {
  constructor(private readonly address: AddressService) {}

  @Get('autocomplete')
  autocomplete(
    @Query(new ZodValidationPipe(addressAutocompleteQuerySchema)) query: AddressAutocompleteQuery,
  ) {
    if (!this.address.configured) {
      throw new ServiceUnavailableException({
        code: 'ADDRESS_PROVIDER_NOT_CONFIGURED',
        message: 'Address search is not configured.',
      });
    }
    return this.address.autocomplete(query.query, query.sessionToken);
  }

  @Get('details')
  details(@Query(new ZodValidationPipe(addressDetailsQuerySchema)) query: AddressDetailsQuery) {
    if (!this.address.configured) {
      throw new ServiceUnavailableException({
        code: 'ADDRESS_PROVIDER_NOT_CONFIGURED',
        message: 'Address search is not configured.',
      });
    }
    return this.address.details(query.placeId, query.sessionToken);
  }
}
