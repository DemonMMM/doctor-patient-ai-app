import bcrypt from 'bcryptjs';
import { User, UserRole } from '../users/user.model';
import { signToken } from '../../utils/jwt';

export type RegisterInput = {
  name: string;
  email: string;
  password: string;
  role: Extract<UserRole, 'DOCTOR' | 'PATIENT'>;
  specialization?: string;
};

export class AuthService {
  static async register(input: RegisterInput) {
    const existing = await User.findOne({ email: input.email });
    if (existing) {
      const err = new Error('Email already in use');
      // @ts-expect-error attach status
      err.status = 409;
      throw err;
    }

    const passwordHash = await bcrypt.hash(input.password, 10);

    const user = await User.create({
      name: input.name,
      email: input.email,
      passwordHash,
      role: input.role,
      approved: input.role === 'DOCTOR' ? false : true,
      specialization: input.role === 'DOCTOR' ? input.specialization : undefined
    });

    const token = signToken({ sub: user.id, role: user.role });

    return {
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        approved: user.role === 'DOCTOR' ? user.approved : undefined
      }
    };
  }

  static async login(email: string, password: string) {
    const user = await User.findOne({ email });
    if (!user) {
      const err = new Error('Invalid credentials');
      // @ts-expect-error attach status
      err.status = 401;
      throw err;
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      const err = new Error('Invalid credentials');
      // @ts-expect-error attach status
      err.status = 401;
      throw err;
    }

    const token = signToken({ sub: user.id, role: user.role });
    return {
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        approved: user.role === 'DOCTOR' ? user.approved : undefined
      }
    };
  }
}
