import prisma from '@/services/prisma';

export type SystemSettings = {
  /** When true, no Advanta SMS is sent system-wide. */
  smsDisabled: boolean;
};

const ROW_ID = 'app';

export async function getSystemSettings(): Promise<SystemSettings> {
  try {
    const row = await prisma.systemSetting.upsert({
      where: { id: ROW_ID },
      update: {},
      create: { id: ROW_ID, smsDisabled: false },
    });
    return { smsDisabled: row.smsDisabled };
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === 'P2021') {
      throw new Error('system_settings is missing in Supabase. Apply the Prisma schema before reading settings.');
    }
    throw error;
  }
}

export async function setSystemSettings(patch: Partial<SystemSettings>): Promise<SystemSettings> {
  const current = await getSystemSettings();
  const smsDisabled = patch.smsDisabled ?? current.smsDisabled;
  const row = await prisma.systemSetting.update({
    where: { id: ROW_ID },
    data: { smsDisabled },
  });
  return { smsDisabled: row.smsDisabled };
}

export async function isSmsGloballyDisabled(): Promise<boolean> {
  const settings = await getSystemSettings();
  return settings.smsDisabled === true;
}
