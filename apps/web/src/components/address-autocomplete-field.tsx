'use client';

import { useEffect, useRef, useState } from 'react';

export interface AddressAutofillResult {
  addressLine1: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  formattedAddress: string;
  placeId: string;
  latitude: number | null;
  longitude: number | null;
}

type AddressSearchStatus = 'idle' | 'provider-unavailable';

interface AddressSuggestion {
  id: string;
  label: string;
}

interface AddressDetailsResponse {
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

const DEBOUNCE_MS = 500;
const MIN_QUERY_LENGTH = 3;

function isAddressSuggestionArray(value: unknown): value is AddressSuggestion[] {
  return (
    Array.isArray(value) &&
    value.every(
      (suggestion) =>
        typeof suggestion === 'object' &&
        suggestion !== null &&
        typeof suggestion.id === 'string' &&
        typeof suggestion.label === 'string',
    )
  );
}

function generateSessionToken(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `session-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Address line 1 input with search-as-you-type suggestions (Mapbox, via the
 *  /api/address/* BFF routes — see AddressService on the API side). Manual
 *  typing always works regardless of whether the provider is configured or
 *  reachable; selecting a suggestion just autofills the rest of the address
 *  fields via onAddressSelected. */
export function AddressAutocompleteField({
  id,
  label,
  required,
  disabled,
  placeholder,
  value,
  onChange,
  onAddressSelected,
}: {
  id: string;
  label: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  onAddressSelected: (result: AddressAutofillResult) => void;
}) {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<AddressSearchStatus>('idle');
  // One Mapbox session token covers every suggest call in a single search
  // interaction plus the retrieve call that closes it out — created once
  // per mount (not per keystroke), reused across all debounced suggest
  // calls below, and only rotated after a successful retrieve (see
  // selectSuggestion's `finally`) so the next interaction bills as a new
  // session instead of reusing a closed one.
  const sessionTokenRef = useRef(generateSessionToken());
  const containerRef = useRef<HTMLDivElement>(null);

  const trimmedValue = value.trim();
  const longEnough = trimmedValue.length >= MIN_QUERY_LENGTH;
  const showSuggestions = open && longEnough && suggestions.length > 0;

  useEffect(() => {
    if (!longEnough) {
      setSuggestions([]);
      setOpen(false);
      setStatus('idle');
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => {
      fetch(
        `/api/address/autocomplete?query=${encodeURIComponent(trimmedValue)}&sessionToken=${sessionTokenRef.current}`,
        { signal: controller.signal },
      )
        .then(async (response) => {
          if (response.status === 503) {
            setStatus('provider-unavailable');
            return [];
          }
          if (!response.ok) throw new Error(`Address search failed with status ${response.status}`);
          return response.json() as Promise<unknown>;
        })
        .then((data) => {
          if (!isAddressSuggestionArray(data)) throw new Error('Address search returned an unexpected response');
          setSuggestions(data);
          setOpen(data.length > 0);
          if (data.length > 0) setStatus('idle');
        })
        .catch((caught: unknown) => {
          if (!(caught instanceof DOMException && caught.name === 'AbortError')) {
            setSuggestions([]);
            setOpen(false);
            setStatus('idle');
          }
        });
    }, DEBOUNCE_MS);

    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  }, [trimmedValue, longEnough]);

  useEffect(() => {
    function onClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  async function selectSuggestion(suggestion: AddressSuggestion) {
    setOpen(false);
    onChange(suggestion.label);

    try {
      const response = await fetch(
        `/api/address/details?placeId=${encodeURIComponent(suggestion.id)}&sessionToken=${sessionTokenRef.current}`,
      );
      if (!response.ok) return;
      const details = (await response.json()) as AddressDetailsResponse | null;
      if (!details) return;

      onAddressSelected({
        addressLine1: details.addressLine1 ?? '',
        city: details.city ?? '',
        state: details.state ?? '',
        postalCode: details.postalCode ?? '',
        country: details.country ?? '',
        formattedAddress: details.formattedAddress ?? suggestion.label,
        placeId: details.placeId,
        latitude: details.latitude,
        longitude: details.longitude,
      });
    } catch {
      // Details lookup failed — the address line is already filled in from
      // the suggestion label, and the rest can still be typed manually.
    } finally {
      sessionTokenRef.current = generateSessionToken();
    }
  }

  return (
    <div className="address-autocomplete front-desk-search-wrap" ref={containerRef}>
      <label htmlFor={id}>
        <span>
          {label} {required && <span className="front-desk-required">*</span>}
        </span>
        <input
          id={id}
          type="text"
          value={value}
          autoComplete="new-password"
          data-1p-ignore="true"
          data-lpignore="true"
          role="combobox"
          aria-expanded={showSuggestions}
          aria-controls={`${id}-suggestions`}
          placeholder={placeholder}
          onChange={(event) => {
            onChange(event.target.value);
            setOpen(suggestions.length > 0);
          }}
          onFocus={() => {
            if (suggestions.length > 0) setOpen(true);
          }}
          required={required}
          disabled={disabled}
          maxLength={200}
        />
      </label>
      {showSuggestions && (
        <ul id={`${id}-suggestions`} role="listbox" className="front-desk-search-results">
          {suggestions.map((suggestion) => (
            <li
              key={suggestion.id}
              role="option"
              aria-selected={false}
              className="front-desk-search-result"
              onPointerDown={(event) => {
                event.preventDefault();
                void selectSuggestion(suggestion);
              }}
            >
              {suggestion.label}
            </li>
          ))}
        </ul>
      )}
      {status === 'provider-unavailable' && (
        <p className="front-desk-inline-hint">Address search needs provider setup; manual entry is available.</p>
      )}
    </div>
  );
}
