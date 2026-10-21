const ZONE = "Africa/Nairobi";

function asDate(value: Date | string | number | null | undefined): Date | null {
  if (value == null || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(value: Date | string | number | null | undefined): string {
  const date = asDate(value);
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-KE", {
    timeZone: ZONE,
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function formatTime(value: Date | string | number | null | undefined): string {
  const date = asDate(value);
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-KE", {
    timeZone: ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

export function formatDateTime(value: Date | string | number | null | undefined): string {
  const date = asDate(value);
  if (!date) return "—";
  return `${formatDate(date)} ${formatTime(date)}`;
}

/** "Wed, 21 Oct 2026, 14:30" in Africa/Nairobi. */
export function formatLongDateTime(value: Date | string | number | null | undefined): string {
  const date = asDate(value);
  if (!date) return "—";
  const datePart = new Intl.DateTimeFormat("en-GB", {
    timeZone: ZONE,
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
  return `${datePart}, ${formatTime(date)}`;
}
