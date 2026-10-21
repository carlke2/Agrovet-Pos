function hostOf(connectionString: string): string | null {
  const at = connectionString.lastIndexOf('@');
  if (at === -1) return null;
  const hostPort = connectionString.slice(at + 1).split('/')[0];
  const host = hostPort.split(':')[0]?.trim();
  return host || null;
}

function isSupabaseHost(host: string): boolean {
  return host.endsWith('.supabase.com') || host.endsWith('.supabase.co');
}

function assertUrl(name: 'DATABASE_URL' | 'DIRECT_URL', value: string | undefined): void {
  const connectionString = value?.trim();
  if (!connectionString) {
    console.error(`${name} is missing. Set it in backend/.env to the Supabase Postgres URL. Refusing to start.`);
    process.exit(1);
  }
  const host = hostOf(connectionString);
  if (!host || !isSupabaseHost(host)) {
    console.error(
      `${name} host "${host || 'unknown'}" is not Supabase. The host must end in .supabase.com or .supabase.co. Refusing to start.`,
    );
    process.exit(1);
  }
}

/** Exit unless both Prisma URLs point at Supabase. No fallback URLs. */
export function assertSupabaseDatabase(): void {
  assertUrl('DATABASE_URL', process.env.DATABASE_URL);
  assertUrl('DIRECT_URL', process.env.DIRECT_URL);
}
