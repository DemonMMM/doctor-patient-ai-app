import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { created, ok, fail } from '../../utils/response';

export class AuthController {
  static async register(req: Request, res: Response) {
    try {
      const { name, email, password, role, specialization } = req.body as {
        name?: string;
        email?: string;
        password?: string;
        role?: 'DOCTOR' | 'PATIENT';
        specialization?: string;
      };

      if (!name || !email || !password || !role) {
        return fail(res, 400, { message: 'Missing required fields' });
      }
      if (role !== 'DOCTOR' && role !== 'PATIENT') {
        return fail(res, 400, { message: 'Invalid role' });
      }

      const result = await AuthService.register({ name, email, password, role, specialization });
      return created(res, result, role === 'DOCTOR' ? 'Doctor registered (pending approval)' : 'Patient registered');
    } catch (err: any) {
      return fail(res, err.status || 500, { message: err.message || 'Server error' });
    }
  }

  static async login(req: Request, res: Response) {
    try {
      const { email, password } = req.body as { email?: string; password?: string };
      if (!email || !password) {
        return fail(res, 400, { message: 'Missing email or password' });
      }

      const result = await AuthService.login(email, password);
      return ok(res, result, 'Logged in');
    } catch (err: any) {
      return fail(res, err.status || 500, { message: err.message || 'Server error' });
    }
  }
}
