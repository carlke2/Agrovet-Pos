import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import prisma from '@/services/prisma';
import { requirePermission } from '@/middlewares/auth';
import { logAuditEvent } from '@/services/audit';
import { isMailConfigured } from '@/services/mail';
import { isAdvantaSmsConfigured } from '@/services/sms';
import { getSystemSettings, setSystemSettings } from '@/services/systemSettings';

const router = Router();

const legacy = requirePermission('legacy_full_access');
const settings = requirePermission('manage_settings');

// ─── GET /api/admin/profile ───────────────────────────────────────────────────
router.get('/profile', legacy, async (req: Request, res: Response): Promise<any> => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { id: true, name: true, email: true, phone: true, createdAt: true, role: { select: { name: true } } },
    });

    if (!user) return res.status(404).json({ message: 'User not found' });

    return res.json({ ...user, _id: user.id, role: user.role.name });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Something went wrong' });
  }
});

// ─── PUT /api/admin/profile ───────────────────────────────────────────────────
router.put('/profile', legacy, async (req: Request, res: Response): Promise<any> => {
  const { name, phone, currentPassword, newPassword } = req.body;
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) return res.status(404).json({ message: 'User not found' });

    let passwordHash = user.password;
    if (newPassword) {
      if (!currentPassword) {
        return res.status(422).json({ message: 'Current password is required to set a new password' });
      }
      const isMatch = await bcrypt.compare(currentPassword, user.password);
      if (!isMatch) {
        return res.status(422).json({ message: 'Current password is incorrect' });
      }
      passwordHash = await bcrypt.hash(newPassword, 10);
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        name: name || user.name,
        phone: phone !== undefined ? phone : user.phone,
        password: passwordHash,
      },
      select: { id: true, name: true, email: true, phone: true, createdAt: true, role: { select: { name: true } } },
    });

    return res.json({ ...updated, _id: updated.id, role: updated.role.name });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Something went wrong' });
  }
});

// ─── GET /api/admin/settings ──────────────────────────────────────────────────
router.get('/settings', settings, async (_req: Request, res: Response): Promise<any> => {
  try {
    const settingsRow = await getSystemSettings();
    return res.json({
      ...settingsRow,
      smsConfigured: isAdvantaSmsConfigured(),
      mailConfigured: isMailConfigured(),
    });
  } catch (error) {
    console.error('Settings get error:', error);
    return res.status(500).json({ message: 'Something went wrong' });
  }
});

// ─── PUT /api/admin/settings ──────────────────────────────────────────────────
router.put('/settings', settings, async (req: Request, res: Response): Promise<any> => {
  try {
    const { smsDisabled } = req.body || {};
    if (typeof smsDisabled !== 'boolean') {
      return res.status(422).json({ message: 'smsDisabled (boolean) is required' });
    }

    const settingsRow = await setSystemSettings({ smsDisabled });

    await logAuditEvent({
      eventType: 'settings',
      userType: req.user!.role.name,
      userId: req.user!.id,
      userName: req.user!.name,
      userEmail: req.user!.email,
      action: smsDisabled ? 'Disable SMS' : 'Enable SMS',
      description: smsDisabled
        ? `${req.user!.name} disabled system-wide SMS`
        : `${req.user!.name} enabled system-wide SMS`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return res.json({
      ...settingsRow,
      smsConfigured: isAdvantaSmsConfigured(),
      mailConfigured: isMailConfigured(),
    });
  } catch (error) {
    console.error('Settings put error:', error);
    return res.status(500).json({ message: 'Something went wrong' });
  }
});

// ─── POST /api/admin/notifications/test ───────────────────────────────────────
router.post('/notifications/test', settings, async (_req: Request, res: Response): Promise<any> => {
  const config = {
    mailConfigured: isMailConfigured(),
    smsConfigured: isAdvantaSmsConfigured(),
    smsDisabled: (await getSystemSettings()).smsDisabled,
  };

  return res.json({
    ok: true,
    config,
    message: config.mailConfigured || config.smsConfigured
      ? 'Notification channels are configured'
      : 'No mail or SMS credentials configured',
  });
});

export default router;
