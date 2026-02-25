import { NextFunction, Request, Response } from 'express';
import { fail } from '../utils/response';

export function requireRole(...roles: Array<'ADMIN' | 'DOCTOR' | 'PATIENT'>) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user) return fail(res, 401, { message: 'Unauthorized' });
    if (!roles.includes(user.role)) return fail(res, 403, { message: 'Forbidden' });
    return next();
  };
}
