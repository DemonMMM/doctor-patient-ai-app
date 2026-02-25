import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { env } from './config/env';
import { authRouter } from './modules/auth/auth.routes';
import { userRouter } from './modules/users/user.routes';
import { consultationRouter } from './modules/consultations/consultation.routes';
import { fail, ok } from './utils/response';

type IceServer = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

function defaultIceServers(): IceServer[] {
  return [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
    {
      urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443', 'turn:openrelay.metered.ca:443?transport=tcp'],
      username: 'openrelayproject',
      credential: 'openrelayproject'
    }
  ];
}

function resolveIceServers(): IceServer[] {
  if (!env.webrtcIceServersJson) return defaultIceServers();
  try {
    const parsed = JSON.parse(env.webrtcIceServersJson);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed as IceServer[];
  } catch {
    // Ignore malformed env and fallback to safe defaults for testing.
  }
  return defaultIceServers();
}

export function createApp() {
  const app = express();
  const publicDir = path.resolve('public');

  // Ensure upload directory exists
  if (!fs.existsSync(env.uploadDir)) {
    fs.mkdirSync(env.uploadDir, { recursive: true });
  }

  app.use(cors());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Serve uploads
  app.use('/uploads', express.static(path.resolve(env.uploadDir)));
  app.use(express.static(publicDir));

  // Health
  app.get('/health', (req: Request, res: Response) => res.json({ ok: true }));
  app.get('/api/config/rtc', (req: Request, res: Response) => {
    return ok(res, { iceServers: resolveIceServers() }, 'RTC config');
  });
  app.get('/', (req: Request, res: Response) => res.sendFile(path.join(publicDir, 'index.html')));

  // Routes
  app.use('/api/auth', authRouter);
  app.use('/api/users', userRouter);
  app.use('/api/consultations', consultationRouter);

  // 404
  app.use((req: Request, res: Response) => fail(res, 404, { message: 'Not found' }));

  // Error handler
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    const status = err?.status || 500;
    const message = err?.message || 'Server error';
    return fail(res, status, { message });
  });

  return app;
}
