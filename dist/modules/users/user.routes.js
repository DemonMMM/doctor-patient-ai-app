"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.userRouter = void 0;
const express_1 = require("express");
const auth_middleware_1 = require("../../middlewares/auth.middleware");
const role_middleware_1 = require("../../middlewares/role.middleware");
const user_controller_1 = require("./user.controller");
exports.userRouter = (0, express_1.Router)();
exports.userRouter.get('/me', auth_middleware_1.requireAuth, user_controller_1.UserController.me);
exports.userRouter.get('/doctors', auth_middleware_1.requireAuth, (0, role_middleware_1.requireRole)('ADMIN', 'DOCTOR', 'PATIENT'), user_controller_1.UserController.listApprovedDoctors);
// Admin
exports.userRouter.get('/pending-doctors', auth_middleware_1.requireAuth, (0, role_middleware_1.requireRole)('ADMIN'), user_controller_1.UserController.listPendingDoctors);
exports.userRouter.patch('/approve-doctor/:doctorId', auth_middleware_1.requireAuth, (0, role_middleware_1.requireRole)('ADMIN'), user_controller_1.UserController.approveDoctor);
exports.userRouter.get('/admin/doctors', auth_middleware_1.requireAuth, (0, role_middleware_1.requireRole)('ADMIN'), user_controller_1.UserController.listDoctorsForAdmin);
exports.userRouter.patch('/admin/doctors/:doctorId/consultation-fee', auth_middleware_1.requireAuth, (0, role_middleware_1.requireRole)('ADMIN'), user_controller_1.UserController.setDoctorConsultationFee);
exports.userRouter.get('/admin/stats', auth_middleware_1.requireAuth, (0, role_middleware_1.requireRole)('ADMIN'), user_controller_1.UserController.adminStats);
