import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import prisma from '@/services/prisma';
import { ensureAuthenticated, loadActiveUser, signToken } from '@/middlewares/auth';
import { clearLoginFailures, isLoginRateLimited, recordLoginFailure } from '@/middlewares/loginRateLimit';
import { logAuditEvent } from '@/services/audit';

const router = Router();

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function clientIp(req: Request): string {
  return req.ip || 'unknown';
}

// ─── POST /api/auth/login ──────────────────────────────────────────────────────
router.post('/login', async (req: Request, res: Response): Promise<any> => {
  const email = normalizeEmail(String(req.body.email ?? req.body.identifier ?? ''));
  const password = String(req.body.password ?? '');
  const ip = clientIp(req);

  if (!email || !password.trim()) {
    return res.status(422).json({ message: 'Email and password are required' });
  }

  if (isLoginRateLimited(ip, email)) {
    return res.status(429).json({ message: 'Too many login attempts. Try again in 15 minutes.' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      include: { role: { select: { name: true } } },
    });

    const fail = (status: number, message: string) => {
      recordLoginFailure(ip, email);
      return res.status(status).json({ message });
    };

    if (!user) {
      return fail(401, 'Invalid credentials');
    }
    if (user.status !== 'active') {
      return fail(403, 'Account is inactive. Contact an administrator.');
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return fail(401, 'Invalid credentials');
    }

    clearLoginFailures(ip, email);

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const token = signToken(user.id);
    const sessionUser = await loadActiveUser(user.id);
    if (!sessionUser) {
      return res.status(403).json({ message: 'Account is inactive. Contact an administrator.' });
    }

    await logAuditEvent({
      eventType: 'login',
      userType: sessionUser.role.name,
      userId: sessionUser.id,
      userName: sessionUser.name,
      userEmail: sessionUser.email,
      action: 'User login',
      description: `${sessionUser.role.name} ${sessionUser.email} logged in`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return res.json({
      token,
      user: {
        id: sessionUser.id,
        name: sessionUser.name,
        email: sessionUser.email,
        phone: sessionUser.phone,
        role: sessionUser.role.name,
        permissions: sessionUser.permissions,
        mustChangePassword: sessionUser.mustChangePassword,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ message: 'Something went wrong' });
  }
});

// ─── GET /api/auth/session ─────────────────────────────────────────────────────
router.get('/session', ensureAuthenticated, async (req: Request, res: Response): Promise<any> => {
  const user = req.user!;
  return res.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role.name,
      permissions: user.permissions,
      mustChangePassword: user.mustChangePassword,
    },
  });
});

export default router;
