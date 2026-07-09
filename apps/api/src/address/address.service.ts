import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';

export interface AddressSuggestion {
  id: string;
  label: string;
}

export interface AddressDetails {
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  formattedAddress: string | null;
  placeId: string;
  latitude: number | null;
  longitude: number | null;
}

interface MapboxSuggestResponse {
  suggestions?: Array<{
    mapbox_id: string;
    name?: string;
    full_address?: string;
    place_formatted?: string;
  }>;
}

interface MapboxRetrieveResponse {
  features?: Array<{
    geometry?: { coordinates?: [number, number] };
    properties?: {
      name?: string;
      full_address?: string;
      context?: {
        address?: { name?: string };
        place?: { name?: string };
        region?: { name?: string; region_code?: string };
        postcode?: { name?: string };
        country?: { name?: string; country_code?: string };
      };
    };
  }>;
}

const MAPBOX_SUGGEST_URL = 'https://api.mapbox.com/search/searchbox/v1/suggest';
const MAPBOX_RETRIEVE_URL = 'https://api.mapbox.com/search/searchbox/v1/retrieve';

/**
 * Owner address autocomplete (Phase 2), backed by Mapbox's Search Box API.
 * The access token is a server-side secret (AppConfigService/
 * MAPBOX_ACCESS_TOKEN) — the browser only ever talks to this API's own
 * /address/* endpoints, never Mapbox directly.
 *
 * `configured` lets AddressController surface a clear 503 up front when no
 * token is set at all (see address.controller.ts), rather than silently
 * returning empty results that would look like "no matches" instead of
 * "not set up". Once a token IS configured, autocomplete/details still fail
 * soft on any transient provider error — return empty/null instead of
 * throwing — so a Mapbox outage never blocks patient creation (manual
 * address entry always still works either way).
 */
@Injectable()
export class AddressService {
  private readonly logger = new Logger(AddressService.name);

  constructor(private readonly config: AppConfigService) {}

  private get accessToken(): string | undefined {
    return this.config.addressProvider.mapboxAccessToken;
  }

  get configured(): boolean {
    return Boolean(this.accessToken);
  }

  async autocomplete(query: string, sessionToken: string): Promise<AddressSuggestion[]> {
    const token = this.accessToken;
    if (!token) return [];

    const url = new URL(MAPBOX_SUGGEST_URL);
    url.searchParams.set('q', query);
    url.searchParams.set('access_token', token);
    url.searchParams.set('session_token', sessionToken);
    url.searchParams.set('types', 'address');
    url.searchParams.set('limit', '5');

    try {
      const response = await fetch(url);
      if (!response.ok) {
        this.logger.warn(`Address autocomplete failed with status ${response.status}`);
        return [];
      }
      const payload = (await response.json()) as MapboxSuggestResponse;
      return (payload.suggestions ?? []).map((suggestion) => ({
        id: suggestion.mapbox_id,
        label: suggestion.full_address ?? [suggestion.name, suggestion.place_formatted].filter(Boolean).join(', '),
      }));
    } catch (error) {
      this.logger.warn(`Address autocomplete request errored: ${(error as Error).message}`);
      return [];
    }
  }

  async details(placeId: string, sessionToken: string): Promise<AddressDetails | null> {
    const token = this.accessToken;
    if (!token) return null;

    const url = new URL(`${MAPBOX_RETRIEVE_URL}/${encodeURIComponent(placeId)}`);
    url.searchParams.set('access_token', token);
    url.searchParams.set('session_token', sessionToken);

    try {
      const response = await fetch(url);
      if (!response.ok) {
        this.logger.warn(`Address details failed with status ${response.status}`);
        return null;
      }
      const payload = (await response.json()) as MapboxRetrieveResponse;
      const feature = payload.features?.[0];
      if (!feature) return null;

      const context = feature.properties?.context ?? {};
      const [longitude, latitude] = feature.geometry?.coordinates ?? [undefined, undefined];

      return {
        addressLine1: context.address?.name ?? feature.properties?.name ?? null,
        city: context.place?.name ?? null,
        state: context.region?.region_code ?? context.region?.name ?? null,
        postalCode: context.postcode?.name ?? null,
        country: context.country?.country_code?.toUpperCase() ?? context.country?.name ?? null,
        formattedAddress: feature.properties?.full_address ?? null,
        placeId,
        latitude: latitude ?? null,
        longitude: longitude ?? null,
      };
    } catch (error) {
      this.logger.warn(`Address details request errored: ${(error as Error).message}`);
      return null;
    }
  }
}
