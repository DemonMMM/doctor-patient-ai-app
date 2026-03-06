"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConsultationController = void 0;
const mongoose_1 = require("mongoose");
const crypto_1 = __importDefault(require("crypto"));
const consultation_model_1 = require("./consultation.model");
const user_model_1 = require("../users/user.model");
const prescription_model_1 = require("../prescriptions/prescription.model");
const response_1 = require("../../utils/response");
const env_1 = require("../../config/env");
const prescription_service_1 = require("../prescriptions/prescription.service");
const report_storage_1 = require("../files/report.storage");
function isObjectId(id) {
    return mongoose_1.Types.ObjectId.isValid(id);
}
function canAccessConsultation(user, c) {
    const patientId = String(c?.patientId?._id || c?.patientId || '');
    const doctorId = String(c?.doctorId?._id || c?.doctorId || '');
    if (user.role === 'ADMIN')
        return c.status !== 'SCHEDULED';
    if (user.role === 'PATIENT')
        return patientId === user.id;
    if (user.role === 'DOCTOR')
        return doctorId === user.id;
    return false;
}
class ConsultationController {
    static callSignalsByConsultation = new Map();
    static getCallSignalBucket(consultationId) {
        const existing = ConsultationController.callSignalsByConsultation.get(consultationId);
        if (existing)
            return existing;
        const bucket = { seq: 0, items: [] };
        ConsultationController.callSignalsByConsultation.set(consultationId, bucket);
        return bucket;
    }
    static getCounterpartRole(role) {
        return role === 'DOCTOR' ? 'PATIENT' : 'DOCTOR';
    }
    static isCallParticipant(req, consultation) {
        if (!req.user)
            return false;
        if (req.user.role !== 'DOCTOR' && req.user.role !== 'PATIENT')
            return false;
        return canAccessConsultation(req.user, consultation);
    }
    // Patient books a consultation with an approved doctor
    static async create(req, res) {
        if (!req.user)
            return (0, response_1.fail)(res, 401, { message: 'Unauthorized' });
        const { doctorId, scheduledAt } = req.body;
        if (!doctorId || !isObjectId(doctorId))
            return (0, response_1.fail)(res, 400, { message: 'Invalid doctorId' });
        const doctor = await user_model_1.User.findOne({ _id: doctorId, role: 'DOCTOR' });
        if (!doctor)
            return (0, response_1.fail)(res, 404, { message: 'Doctor not found' });
        if (!doctor.approved)
            return (0, response_1.fail)(res, 403, { message: 'Doctor is not approved yet' });
        const existingActive = await consultation_model_1.Consultation.findOne({
            patientId: req.user.id,
            doctorId,
            status: { $in: ['REQUESTED', 'SCHEDULED', 'IN_PROGRESS'] }
        }).select('_id status scheduledAt');
        if (existingActive) {
            return (0, response_1.fail)(res, 409, {
                message: 'You already have an active consultation with this doctor. Please continue the existing one.'
            });
        }
        const consultation = await consultation_model_1.Consultation.create({
            patientId: new mongoose_1.Types.ObjectId(req.user.id),
            doctorId: new mongoose_1.Types.ObjectId(doctorId),
            status: scheduledAt ? 'SCHEDULED' : 'REQUESTED',
            scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
            paymentStatus: 'PENDING',
            payment: {
                provider: 'MOCK_RAZORPAY',
                amount: typeof doctor.consultationFee === 'number' && Number.isFinite(doctor.consultationFee) && doctor.consultationFee > 0
                    ? Math.round(doctor.consultationFee)
                    : 499,
                currency: 'INR'
            },
            chat: [],
            reports: []
        });
        const populated = await consultation_model_1.Consultation.findById(consultation._id)
            .populate('doctorId', 'name email specialization role approved')
            .populate('patientId', 'name email role');
        return (0, response_1.created)(res, populated ?? consultation, 'Consultation booked (payment pending)');
    }
    static async my(req, res) {
        if (!req.user)
            return (0, response_1.fail)(res, 401, { message: 'Unauthorized' });
        const filter = req.user.role === 'PATIENT'
            ? { patientId: req.user.id, status: { $ne: 'COMPLETED' } }
            : req.user.role === 'DOCTOR'
                ? { doctorId: req.user.id, status: { $ne: 'COMPLETED' } }
                : { status: { $nin: ['SCHEDULED', 'COMPLETED'] } };
        const consultations = await consultation_model_1.Consultation.find(filter)
            .populate('doctorId', 'name email specialization role approved')
            .populate('patientId', 'name email role')
            .sort({ createdAt: -1 });
        return (0, response_1.ok)(res, consultations, 'My consultations');
    }
    static async getById(req, res) {
        if (!req.user)
            return (0, response_1.fail)(res, 401, { message: 'Unauthorized' });
        const c = await consultation_model_1.Consultation.findById(req.params.id)
            .populate('doctorId', 'name email specialization role approved')
            .populate('patientId', 'name email role');
        if (!c)
            return (0, response_1.fail)(res, 404, { message: 'Consultation not found' });
        if (!canAccessConsultation(req.user, c))
            return (0, response_1.fail)(res, 403, { message: 'Forbidden' });
        return (0, response_1.ok)(res, c, 'Consultation');
    }
    static async addMessage(req, res) {
        if (!req.user)
            return (0, response_1.fail)(res, 401, { message: 'Unauthorized' });
        const c = await consultation_model_1.Consultation.findById(req.params.id);
        if (!c)
            return (0, response_1.fail)(res, 404, { message: 'Consultation not found' });
        if (!canAccessConsultation(req.user, c))
            return (0, response_1.fail)(res, 403, { message: 'Forbidden' });
        // Doctor must be approved to chat
        if (req.user.role === 'DOCTOR') {
            const doctor = await user_model_1.User.findById(req.user.id);
            if (!doctor || !doctor.approved)
                return (0, response_1.fail)(res, 403, { message: 'Doctor not approved' });
        }
        if (req.user.role === 'PATIENT' && c.paymentStatus !== 'PAID') {
            return (0, response_1.fail)(res, 402, { message: 'Payment required before chat' });
        }
        const { message } = req.body;
        if (!message?.trim())
            return (0, response_1.fail)(res, 400, { message: 'Message is required' });
        c.chat.push({
            senderRole: req.user.role === 'DOCTOR' ? 'DOCTOR' : 'PATIENT',
            senderId: new mongoose_1.Types.ObjectId(req.user.id),
            message: message.trim(),
            createdAt: new Date()
        });
        if (c.status === 'REQUESTED' || c.status === 'SCHEDULED')
            c.status = 'IN_PROGRESS';
        await c.save();
        return (0, response_1.ok)(res, c, 'Message added');
    }
    static async uploadReport(req, res) {
        if (!req.user)
            return (0, response_1.fail)(res, 401, { message: 'Unauthorized' });
        const c = await consultation_model_1.Consultation.findById(req.params.id);
        if (!c)
            return (0, response_1.fail)(res, 404, { message: 'Consultation not found' });
        if (req.user.role !== 'PATIENT' || String(c.patientId) !== req.user.id) {
            return (0, response_1.fail)(res, 403, { message: 'Only the patient can upload reports' });
        }
        const file = req.file;
        if (!file)
            return (0, response_1.fail)(res, 400, { message: 'file is required (multipart/form-data)' });
        const stored = await report_storage_1.ReportStorage.saveReport({
            buffer: file.buffer,
            filename: file.originalname,
            contentType: file.mimetype,
            consultationId: c.id,
            uploadedByUserId: req.user.id
        });
        c.reports.push({
            originalName: file.originalname,
            mimeType: file.mimetype,
            size: file.size,
            path: `/api/consultations/${c.id}/reports/${stored._id.toString()}/view`,
            uploadedAt: new Date()
        });
        await c.save();
        return (0, response_1.ok)(res, c, 'Report uploaded');
    }
    static async viewReport(req, res) {
        if (!req.user)
            return (0, response_1.fail)(res, 401, { message: 'Unauthorized' });
        const c = await consultation_model_1.Consultation.findById(req.params.id);
        if (!c)
            return (0, response_1.fail)(res, 404, { message: 'Consultation not found' });
        if (!canAccessConsultation(req.user, c))
            return (0, response_1.fail)(res, 403, { message: 'Forbidden' });
        const fileId = req.params.fileId;
        if (!mongoose_1.Types.ObjectId.isValid(fileId))
            return (0, response_1.fail)(res, 400, { message: 'Invalid fileId' });
        const expectedPath = `/api/consultations/${c.id}/reports/${fileId}/view`;
        const existsOnConsultation = (c.reports || []).some((r) => r.path === expectedPath);
        if (!existsOnConsultation)
            return (0, response_1.fail)(res, 404, { message: 'Report not linked to consultation' });
        const file = await report_storage_1.ReportStorage.getReportFile(fileId);
        if (!file)
            return (0, response_1.fail)(res, 404, { message: 'Report file not found' });
        const mimeType = file.metadata?.mimeType;
        res.setHeader('Content-Type', mimeType || 'application/octet-stream');
        res.setHeader('Content-Disposition', `inline; filename=\"${file.filename}\"`);
        const stream = report_storage_1.ReportStorage.openDownloadStream(fileId);
        stream.on('error', () => {
            if (!res.headersSent)
                return (0, response_1.fail)(res, 500, { message: 'Failed to read report file' });
            res.end();
        });
        stream.pipe(res);
    }
    // Mock Razorpay: create order
    static async mockCreateOrder(req, res) {
        if (!req.user)
            return (0, response_1.fail)(res, 401, { message: 'Unauthorized' });
        const c = await consultation_model_1.Consultation.findById(req.params.id);
        if (!c)
            return (0, response_1.fail)(res, 404, { message: 'Consultation not found' });
        if (req.user.role !== 'PATIENT' || String(c.patientId) !== req.user.id) {
            return (0, response_1.fail)(res, 403, { message: 'Forbidden' });
        }
        if (c.status !== 'IN_PROGRESS') {
            return (0, response_1.fail)(res, 400, { message: 'Doctor approval required before payment' });
        }
        const orderId = `order_mock_${crypto_1.default.randomBytes(8).toString('hex')}`;
        c.payment = {
            provider: 'MOCK_RAZORPAY',
            amount: c.payment?.amount ?? 499,
            currency: c.payment?.currency ?? 'INR',
            orderId
        };
        c.paymentStatus = 'PENDING';
        await c.save();
        return (0, response_1.ok)(res, {
            keyId: env_1.env.razorpayKeyId,
            orderId,
            amount: c.payment.amount,
            currency: c.payment.currency
        }, 'Mock order created');
    }
    // Mock Razorpay: verify payment
    static async mockVerifyPayment(req, res) {
        if (!req.user)
            return (0, response_1.fail)(res, 401, { message: 'Unauthorized' });
        const c = await consultation_model_1.Consultation.findById(req.params.id);
        if (!c)
            return (0, response_1.fail)(res, 404, { message: 'Consultation not found' });
        if (req.user.role !== 'PATIENT' || String(c.patientId) !== req.user.id) {
            return (0, response_1.fail)(res, 403, { message: 'Forbidden' });
        }
        if (c.status !== 'IN_PROGRESS') {
            return (0, response_1.fail)(res, 400, { message: 'Doctor approval required before payment verification' });
        }
        const { paymentId } = req.body;
        if (!c.payment?.orderId)
            return (0, response_1.fail)(res, 400, { message: 'No order found. Create order first.' });
        const pid = paymentId || `pay_mock_${crypto_1.default.randomBytes(8).toString('hex')}`;
        // Simple mock signature
        const signature = crypto_1.default
            .createHmac('sha256', env_1.env.razorpayKeySecret)
            .update(`${c.payment.orderId}|${pid}`)
            .digest('hex');
        c.payment.paymentId = pid;
        c.payment.signature = signature;
        c.paymentStatus = 'PAID';
        await c.save();
        return (0, response_1.ok)(res, { consultationId: c.id, paymentStatus: c.paymentStatus }, 'Mock payment verified');
    }
    // Doctor: generate & store prescription
    static async generatePrescription(req, res) {
        if (!req.user)
            return (0, response_1.fail)(res, 401, { message: 'Unauthorized' });
        const c = await consultation_model_1.Consultation.findById(req.params.id);
        if (!c)
            return (0, response_1.fail)(res, 404, { message: 'Consultation not found' });
        if (req.user.role !== 'DOCTOR' || String(c.doctorId) !== req.user.id) {
            return (0, response_1.fail)(res, 403, { message: 'Only the assigned doctor can generate prescription' });
        }
        const doctor = await user_model_1.User.findById(req.user.id);
        if (!doctor || !doctor.approved)
            return (0, response_1.fail)(res, 403, { message: 'Doctor not approved' });
        if (c.status !== 'IN_PROGRESS') {
            return (0, response_1.fail)(res, 400, { message: 'Consultation must be approved by doctor before prescription generation' });
        }
        if (c.paymentStatus !== 'PAID')
            return (0, response_1.fail)(res, 402, { message: 'Payment required before prescription generation' });
        try {
            const prescription = await prescription_service_1.PrescriptionService.generateAndStore(c.id);
            c.status = 'COMPLETED';
            await c.save();
            return (0, response_1.ok)(res, prescription, 'Prescription generated');
        }
        catch (err) {
            return (0, response_1.fail)(res, err.status || 500, { message: err.message || 'Server error' });
        }
    }
    // Patient: view prescriptions for themselves (via consultation route for MVP)
    static async myPrescriptions(req, res) {
        if (!req.user)
            return (0, response_1.fail)(res, 401, { message: 'Unauthorized' });
        if (req.user.role === 'PATIENT') {
            const prescriptions = await prescription_service_1.PrescriptionService.listForPatient(req.user.id);
            return (0, response_1.ok)(res, prescriptions, 'My prescriptions');
        }
        if (req.user.role === 'DOCTOR') {
            const prescriptions = await prescription_service_1.PrescriptionService.listForDoctor(req.user.id);
            return (0, response_1.ok)(res, prescriptions, 'My issued prescriptions');
        }
        return (0, response_1.fail)(res, 403, { message: 'Forbidden' });
    }
    static async doctorCompleteAndDelete(req, res) {
        if (!req.user)
            return (0, response_1.fail)(res, 401, { message: 'Unauthorized' });
        const c = await consultation_model_1.Consultation.findById(req.params.id);
        if (!c)
            return (0, response_1.fail)(res, 404, { message: 'Consultation not found' });
        if (req.user.role !== 'DOCTOR' || String(c.doctorId) !== req.user.id) {
            return (0, response_1.fail)(res, 403, { message: 'Only the assigned doctor can mark done' });
        }
        if (c.status !== 'IN_PROGRESS') {
            return (0, response_1.fail)(res, 400, { message: 'Consultation can be deleted only when status is IN_PROGRESS' });
        }
        await prescription_model_1.Prescription.deleteMany({ consultationId: c._id });
        await c.deleteOne();
        ConsultationController.callSignalsByConsultation.delete(String(c._id));
        return (0, response_1.ok)(res, { consultationId: req.params.id, deleted: true }, 'Consultation marked done and deleted');
    }
    static async doctorApproveScheduled(req, res) {
        if (!req.user)
            return (0, response_1.fail)(res, 401, { message: 'Unauthorized' });
        const c = await consultation_model_1.Consultation.findById(req.params.id);
        if (!c)
            return (0, response_1.fail)(res, 404, { message: 'Consultation not found' });
        if (req.user.role !== 'DOCTOR' || String(c.doctorId) !== req.user.id) {
            return (0, response_1.fail)(res, 403, { message: 'Only the assigned doctor can approve consultation' });
        }
        const doctor = await user_model_1.User.findById(req.user.id);
        if (!doctor || !doctor.approved)
            return (0, response_1.fail)(res, 403, { message: 'Doctor not approved' });
        if (c.status !== 'SCHEDULED' && c.status !== 'REQUESTED') {
            return (0, response_1.fail)(res, 400, { message: 'Only scheduled/requested consultations can be approved' });
        }
        c.status = 'IN_PROGRESS';
        await c.save();
        return (0, response_1.ok)(res, { consultationId: c.id, status: c.status }, 'Consultation approved by doctor');
    }
    static async sendCallSignal(req, res) {
        if (!req.user)
            return (0, response_1.fail)(res, 401, { message: 'Unauthorized' });
        const c = await consultation_model_1.Consultation.findById(req.params.id);
        if (!c)
            return (0, response_1.fail)(res, 404, { message: 'Consultation not found' });
        if (!ConsultationController.isCallParticipant(req, c)) {
            return (0, response_1.fail)(res, 403, { message: 'Only assigned doctor/patient can use call signaling' });
        }
        if (c.status !== 'IN_PROGRESS') {
            return (0, response_1.fail)(res, 400, { message: 'Consultation must be approved by doctor before call' });
        }
        if (c.paymentStatus !== 'PAID') {
            return (0, response_1.fail)(res, 402, { message: 'Payment required before call' });
        }
        const { type, payload, toRole } = req.body;
        const allowedTypes = ['offer', 'answer', 'ice-candidate', 'hangup'];
        if (!type || !allowedTypes.includes(type)) {
            return (0, response_1.fail)(res, 400, { message: 'Invalid signal type' });
        }
        const targetRole = toRole || ConsultationController.getCounterpartRole(req.user.role);
        if (targetRole !== 'DOCTOR' && targetRole !== 'PATIENT') {
            return (0, response_1.fail)(res, 400, { message: 'Invalid toRole' });
        }
        const bucket = ConsultationController.getCallSignalBucket(c.id);
        bucket.seq += 1;
        bucket.items.push({
            id: bucket.seq,
            fromUserId: req.user.id,
            fromRole: req.user.role,
            toRole: targetRole,
            type,
            payload: payload ?? null,
            createdAt: new Date().toISOString()
        });
        if (bucket.items.length > 500) {
            bucket.items = bucket.items.slice(-500);
        }
        return (0, response_1.ok)(res, { signalId: bucket.seq }, 'Call signal sent');
    }
    static async getCallSignals(req, res) {
        if (!req.user)
            return (0, response_1.fail)(res, 401, { message: 'Unauthorized' });
        const c = await consultation_model_1.Consultation.findById(req.params.id);
        if (!c)
            return (0, response_1.fail)(res, 404, { message: 'Consultation not found' });
        if (!ConsultationController.isCallParticipant(req, c)) {
            return (0, response_1.fail)(res, 403, { message: 'Only assigned doctor/patient can use call signaling' });
        }
        if (c.status !== 'IN_PROGRESS') {
            return (0, response_1.fail)(res, 400, { message: 'Consultation must be approved by doctor before call' });
        }
        if (c.paymentStatus !== 'PAID') {
            return (0, response_1.fail)(res, 402, { message: 'Payment required before call' });
        }
        const since = Number(req.query.since || 0);
        const sinceId = Number.isFinite(since) ? since : 0;
        const bucket = ConsultationController.getCallSignalBucket(c.id);
        const signals = bucket.items.filter((s) => s.id > sinceId && s.toRole === req.user.role && s.fromUserId !== req.user.id);
        return (0, response_1.ok)(res, {
            signals,
            lastId: bucket.seq
        }, 'Call signals');
    }
}
exports.ConsultationController = ConsultationController;
