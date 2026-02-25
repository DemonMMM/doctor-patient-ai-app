import { Response } from 'express';

export type ApiErrorPayload = {
  message: string;
  code?: string;
  details?: unknown;
};

export function ok<T>(res: Response, data: T, message = 'OK') {
  return res.status(200).json({ success: true, message, data });
}

export function created<T>(res: Response, data: T, message = 'Created') {
  return res.status(201).json({ success: true, message, data });
}

export function fail(res: Response, status: number, payload: ApiErrorPayload) {
  return res.status(status).json({ success: false, ...payload });
}
