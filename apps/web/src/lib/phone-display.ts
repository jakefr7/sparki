/** Keep non-US numbers and extensions intact; format recognizable US numbers. */
export function formatPhone(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, '');
  const local = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  return local.length === 10 && !/[a-z]/i.test(value)
    ? `${digits.length === 11 ? '+1 ' : ''}(${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6)}`
    : value;
}
