import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.middleware';
import { requireRole } from '../../middlewares/role.middleware';
import { UserController } from './user.controller';

export const userRouter = Router();

userRouter.get('/me', requireAuth, UserController.me);
userRouter.get('/doctors', requireAuth, requireRole('ADMIN', 'DOCTOR', 'PATIENT'), UserController.listApprovedDoctors);

// Admin
userRouter.get('/pending-doctors', requireAuth, requireRole('ADMIN'), UserController.listPendingDoctors);
userRouter.patch('/approve-doctor/:doctorId', requireAuth, requireRole('ADMIN'), UserController.approveDoctor);
userRouter.get('/admin/doctors', requireAuth, requireRole('ADMIN'), UserController.listDoctorsForAdmin);
userRouter.patch('/admin/doctors/:doctorId/consultation-fee', requireAuth, requireRole('ADMIN'), UserController.setDoctorConsultationFee);
userRouter.get('/admin/stats', requireAuth, requireRole('ADMIN'), UserController.adminStats);
