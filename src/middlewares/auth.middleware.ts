import { NextFunction, Request, Response } from 'express';
import { verifyToken } from '../utils/jwt';
import { fail } from '../utils/response';

export type AuthUser = {
  id: string;
  role: 'ADMIN' | 'DOCTOR' | 'PATIENT';
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return fail(res, 401, { message: 'Unauthorized' });
  }

  const token = authHeader.slice('Bearer '.length);
  try {
    const payload = verifyToken(token);
    req.user = { id: payload.sub, role: payload.role };
    return next();
  } catch {
    return fail(res, 401, { message: 'Invalid or expired token' });
  }
}
