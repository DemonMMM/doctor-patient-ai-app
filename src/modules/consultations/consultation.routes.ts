import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../../middlewares/auth.middleware';
import { requireRole } from '../../middlewares/role.middleware';
import { ConsultationController } from './consultation.controller';
import { AIController } from '../ai/ai.controller';

export const consultationRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

consultationRouter.post('/', requireAuth, requireRole('PATIENT'), ConsultationController.create);
consultationRouter.get('/my', requireAuth, requireRole('PATIENT', 'DOCTOR', 'ADMIN'), ConsultationController.my);
consultationRouter.get('/my/prescriptions', requireAuth, requireRole('PATIENT', 'DOCTOR'), ConsultationController.myPrescriptions);

consultationRouter.get('/:id', requireAuth, requireRole('PATIENT', 'DOCTOR', 'ADMIN'), ConsultationController.getById);
consultationRouter.post('/:id/messages', requireAuth, requireRole('PATIENT', 'DOCTOR', 'ADMIN'), ConsultationController.addMessage);
consultationRouter.get('/:id/reports/:fileId/view', requireAuth, requireRole('PATIENT', 'DOCTOR', 'ADMIN'), ConsultationController.viewReport);
consultationRouter.get('/:id/call/signals', requireAuth, requireRole('PATIENT', 'DOCTOR'), ConsultationController.getCallSignals);
consultationRouter.post('/:id/call/signal', requireAuth, requireRole('PATIENT', 'DOCTOR'), ConsultationController.sendCallSignal);

// Upload report
consultationRouter.post(
  '/:id/reports',
  requireAuth,
  requireRole('PATIENT'),
  upload.single('file'),
  ConsultationController.uploadReport
);

// Mock payment
consultationRouter.post(
  '/:id/payment/mock/create-order',
  requireAuth,
  requireRole('PATIENT'),
  ConsultationController.mockCreateOrder
);
consultationRouter.post(
  '/:id/payment/mock/verify',
  requireAuth,
  requireRole('PATIENT'),
  ConsultationController.mockVerifyPayment
);

// AI endpoints (controller lives in modules/ai)
consultationRouter.post('/:id/ai/summary', requireAuth, requireRole('DOCTOR', 'ADMIN'), AIController.generateSummary);
consultationRouter.post('/:id/ai/suggestions', requireAuth, requireRole('DOCTOR', 'ADMIN'), AIController.generateSuggestions);

// Prescription generation
consultationRouter.post('/:id/ai/prescription', requireAuth, requireRole('DOCTOR'), ConsultationController.generatePrescription);
consultationRouter.post('/:id/doctor/prescription', requireAuth, requireRole('DOCTOR'), ConsultationController.saveDoctorPrescription);
consultationRouter.post(
  '/:id/doctor/approve',
  requireAuth,
  requireRole('DOCTOR'),
  ConsultationController.doctorApproveScheduled
);
consultationRouter.post(
  '/:id/doctor/complete-delete',
  requireAuth,
  requireRole('DOCTOR'),
  ConsultationController.doctorCompleteAndDelete
);
