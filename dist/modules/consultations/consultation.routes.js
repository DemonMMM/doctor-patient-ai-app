"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.consultationRouter = void 0;
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const auth_middleware_1 = require("../../middlewares/auth.middleware");
const role_middleware_1 = require("../../middlewares/role.middleware");
const env_1 = require("../../config/env");
const consultation_controller_1 = require("./consultation.controller");
const ai_controller_1 = require("../ai/ai.controller");
exports.consultationRouter = (0, express_1.Router)();
const storage = multer_1.default.diskStorage({
    destination: (req, file, cb) => {
        cb(null, env_1.env.uploadDir);
    },
    filename: (req, file, cb) => {
        const safeOriginal = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
        cb(null, `${Date.now()}_${safeOriginal}`);
    }
});
const upload = (0, multer_1.default)({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }
});
exports.consultationRouter.post('/', auth_middleware_1.requireAuth, (0, role_middleware_1.requireRole)('PATIENT'), consultation_controller_1.ConsultationController.create);
exports.consultationRouter.get('/my', auth_middleware_1.requireAuth, (0, role_middleware_1.requireRole)('PATIENT', 'DOCTOR', 'ADMIN'), consultation_controller_1.ConsultationController.my);
exports.consultationRouter.get('/my/prescriptions', auth_middleware_1.requireAuth, (0, role_middleware_1.requireRole)('PATIENT', 'DOCTOR'), consultation_controller_1.ConsultationController.myPrescriptions);
exports.consultationRouter.get('/:id', auth_middleware_1.requireAuth, (0, role_middleware_1.requireRole)('PATIENT', 'DOCTOR', 'ADMIN'), consultation_controller_1.ConsultationController.getById);
exports.consultationRouter.post('/:id/messages', auth_middleware_1.requireAuth, (0, role_middleware_1.requireRole)('PATIENT', 'DOCTOR', 'ADMIN'), consultation_controller_1.ConsultationController.addMessage);
exports.consultationRouter.get('/:id/call/signals', auth_middleware_1.requireAuth, (0, role_middleware_1.requireRole)('PATIENT', 'DOCTOR'), consultation_controller_1.ConsultationController.getCallSignals);
exports.consultationRouter.post('/:id/call/signal', auth_middleware_1.requireAuth, (0, role_middleware_1.requireRole)('PATIENT', 'DOCTOR'), consultation_controller_1.ConsultationController.sendCallSignal);
// Upload report
exports.consultationRouter.post('/:id/reports', auth_middleware_1.requireAuth, (0, role_middleware_1.requireRole)('PATIENT'), upload.single('file'), consultation_controller_1.ConsultationController.uploadReport);
// Mock payment
exports.consultationRouter.post('/:id/payment/mock/create-order', auth_middleware_1.requireAuth, (0, role_middleware_1.requireRole)('PATIENT'), consultation_controller_1.ConsultationController.mockCreateOrder);
exports.consultationRouter.post('/:id/payment/mock/verify', auth_middleware_1.requireAuth, (0, role_middleware_1.requireRole)('PATIENT'), consultation_controller_1.ConsultationController.mockVerifyPayment);
// AI endpoints (controller lives in modules/ai)
exports.consultationRouter.post('/:id/ai/summary', auth_middleware_1.requireAuth, (0, role_middleware_1.requireRole)('DOCTOR', 'ADMIN'), ai_controller_1.AIController.generateSummary);
exports.consultationRouter.post('/:id/ai/suggestions', auth_middleware_1.requireAuth, (0, role_middleware_1.requireRole)('DOCTOR', 'ADMIN'), ai_controller_1.AIController.generateSuggestions);
// Prescription generation
exports.consultationRouter.post('/:id/ai/prescription', auth_middleware_1.requireAuth, (0, role_middleware_1.requireRole)('DOCTOR'), consultation_controller_1.ConsultationController.generatePrescription);
exports.consultationRouter.post('/:id/doctor/approve', auth_middleware_1.requireAuth, (0, role_middleware_1.requireRole)('DOCTOR'), consultation_controller_1.ConsultationController.doctorApproveScheduled);
exports.consultationRouter.post('/:id/doctor/complete-delete', auth_middleware_1.requireAuth, (0, role_middleware_1.requireRole)('DOCTOR'), consultation_controller_1.ConsultationController.doctorCompleteAndDelete);
