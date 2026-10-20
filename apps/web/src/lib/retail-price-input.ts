/** Normalize familiar US price notation without rounding or floating-point math.
 * Invalid grouping stays invalid instead of silently changing the amount. */
export function retailPriceInput(value: string): string | null {
  const input = value.trim();
  if (!input) return null;
  const plain = input.replace(/^\$\s*/, '');
  if (!/^-?(?:\d+|\d{1,3}(?:,\d{3})+|)(?:\.\d{0,8})?$/.test(plain) || !/\d/.test(plain)) {
    throw new Error('Enter a retail price such as 4.50 or $1,234.50, with up to 8 decimal places.');
  }
  return plain
    .replace(/,/g, '')
    .replace(/^(-?)\./, '$10.')
    .replace(/\.$/, '');
}
