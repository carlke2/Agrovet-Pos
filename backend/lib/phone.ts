/**
 * Phone key shared by customer create and edit.
 * Spaces, "+" and "-" are removed. Kenyan local forms become 254 plus the subscriber digits.
 * phoneKey is the normalized digits. The typed value is stored separately.
 */
export function normalizePhoneKey(typed: string): string | null {
  const digits = typed.replace(/[\s+-]/g, '');
  if (!/^\d+$/.test(digits)) return null;

  let key = digits;
  if (/^0[17]\d{8}$/.test(digits)) {
    key = `254${digits.slice(-9)}`;
  } else if (/^[17]\d{8}$/.test(digits)) {
    key = `254${digits}`;
  } else if (digits.startsWith('254')) {
    key = digits;
  }

  if (!/^\d{9,15}$/.test(key)) return null;
  return key;
}
