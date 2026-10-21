const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;

type Bucket = { failures: number; resetAt: number };

const buckets = new Map<string, Bucket>();

function keyFor(ip: string, email: string): string {
  return `${ip}|${email.trim().toLowerCase()}`;
}

function bucket(ip: string, email: string): Bucket {
  const key = keyFor(ip, email);
  const now = Date.now();
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    const fresh = { failures: 0, resetAt: now + WINDOW_MS };
    buckets.set(key, fresh);
    return fresh;
  }
  return current;
}

export function isLoginRateLimited(ip: string, email: string): boolean {
  return bucket(ip, email).failures >= MAX_FAILURES;
}

export function recordLoginFailure(ip: string, email: string): void {
  bucket(ip, email).failures += 1;
}

export function clearLoginFailures(ip: string, email: string): void {
  buckets.delete(keyFor(ip, email));
}
