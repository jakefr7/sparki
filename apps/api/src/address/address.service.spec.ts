import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppConfigService } from '../config/app-config.service';
import { AddressService } from './address.service';

function createService(mapboxAccessToken: string | undefined): AddressService {
  return new AddressService({
    addressProvider: { mapboxAccessToken },
  } as unknown as AppConfigService);
}

function mockFetchOnce(body: unknown, ok = true, status = 200): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok,
      status,
      json: () => Promise.resolve(body),
    }),
  );
}

describe('AddressService', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('when no provider token is configured', () => {
    let service: AddressService;

    beforeEach(() => {
      service = createService(undefined);
      vi.stubGlobal('fetch', vi.fn());
    });

    it('autocomplete degrades to an empty array without calling the provider', async () => {
      const result = await service.autocomplete('123 Main St', 'session-1');
      expect(result).toEqual([]);
      expect(fetch).not.toHaveBeenCalled();
    });

    it('details degrades to null without calling the provider', async () => {
      const result = await service.details('place-1', 'session-1');
      expect(result).toBeNull();
      expect(fetch).not.toHaveBeenCalled();
    });
  });

  describe('when a provider token is configured', () => {
    let service: AddressService;

    beforeEach(() => {
      service = createService('test-token');
    });

    it('parses suggestions from a successful autocomplete response', async () => {
      mockFetchOnce({
        suggestions: [
          {
            mapbox_id: 'place-1',
            name: '740 15th Street Northwest',
            full_address: '740 15th Street Northwest, Washington, District of Columbia 20005, United States',
          },
        ],
      });

      const result = await service.autocomplete('740 15th', 'session-1');
      expect(result).toEqual([
        {
          id: 'place-1',
          label: '740 15th Street Northwest, Washington, District of Columbia 20005, United States',
        },
      ]);
    });

    it('returns an empty array when the provider responds with an error status', async () => {
      mockFetchOnce({}, false, 500);
      const result = await service.autocomplete('740 15th', 'session-1');
      expect(result).toEqual([]);
    });

    it('returns an empty array when the fetch itself throws', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
      const result = await service.autocomplete('740 15th', 'session-1');
      expect(result).toEqual([]);
    });

    it('parses structured details from a successful retrieve response', async () => {
      mockFetchOnce({
        features: [
          {
            geometry: { coordinates: [-77.0366, 38.9012] },
            properties: {
              name: '740 15th Street Northwest',
              full_address: '740 15th Street Northwest, Washington, District of Columbia 20005, United States',
              context: {
                address: { name: '740 15th Street Northwest' },
                place: { name: 'Washington' },
                region: { name: 'District of Columbia', region_code: 'DC' },
                postcode: { name: '20005' },
                country: { name: 'United States', country_code: 'us' },
              },
            },
          },
        ],
      });

      const result = await service.details('place-1', 'session-1');
      expect(result).toEqual({
        addressLine1: '740 15th Street Northwest',
        city: 'Washington',
        state: 'DC',
        postalCode: '20005',
        country: 'US',
        formattedAddress: '740 15th Street Northwest, Washington, District of Columbia 20005, United States',
        placeId: 'place-1',
        latitude: 38.9012,
        longitude: -77.0366,
      });
    });

    it('returns null when the retrieve response has no features', async () => {
      mockFetchOnce({ features: [] });
      const result = await service.details('place-1', 'session-1');
      expect(result).toBeNull();
    });
  });
});
