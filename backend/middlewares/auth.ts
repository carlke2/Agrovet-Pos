import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '@/services/prisma';
import { Permission, isPermission } from '@/permissions';

const JWT_SECRET = process.env.JWT_SECRET || 'agrovet-pos-dev-secret';
const TOKEN_TTL = '12h';

/** Claims stored in the JWT. Permissions are loaded from the database, not the token. */
export interface AuthPayload {
  id: string;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  status: string;
  mustChangePassword: boolean;
  role: { id: string; name: string };
  permissions: string[];
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export const signToken = (userId: string): string => {
  const payload: AuthPayload = { id: userId };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_TTL });
};

export function readTokenUserId(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;
  try {
    const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
    if (!decoded || typeof decoded !== 'object' || typeof (decoded as AuthPayload).id !== 'string') {
      return null;
    }
    return (decoded as AuthPayload).id;
  } catch {
    return null;
  }
}

export async function loadActiveUser(userId: string): Promise<AuthUser | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      role: { include: { permissions: { select: { permission: true } } } },
    },
  });
  if (!user || user.status !== 'active' || !user.role) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    status: user.status,
    mustChangePassword: user.mustChangePassword,
    role: { id: user.role.id, name: user.role.name },
    permissions: user.role.permissions.map((row) => row.permission).filter(isPermission),
  };
}

export function hasPermission(user: { permissions: string[] } | null | undefined, permission: Permission): boolean {
  return !!user?.permissions.includes(permission);
}

export const ensureAuthenticated = (req: Request, res: Response, next: NextFunction): void => {
  const userId = readTokenUserId(req);
  if (!userId) {
    res.status(401).json({ error: 'No token provided' });
    return;
  }

  loadActiveUser(userId)
    .then((user) => {
      if (!user) {
        res.status(401).json({ error: 'Invalid or expired token' });
        return;
      }
      req.user = user;
      next();
    })
    .catch((error) => {
      console.error('Auth lookup failed:', error);
      res.status(500).json({ error: 'Something went wrong' });
    });
};

export function requirePermission(permission: Permission) {
  return (req: Request, res: Response, next: NextFunction): void => {
    ensureAuthenticated(req, res, () => {
      if (!hasPermission(req.user, permission)) {
        res.status(403).json({ error: 'Permission denied' });
        return;
      }
      next();
    });
  };
}
