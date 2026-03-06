import { Request, Response } from 'express';
import { Types } from 'mongoose';
import crypto from 'crypto';
import { Consultation } from './consultation.model';
import { User } from '../users/user.model';
import { Prescription } from '../prescriptions/prescription.model';
import { fail, created, ok } from '../../utils/response';
import { env } from '../../config/env';
import { PrescriptionService } from '../prescriptions/prescription.service';
import { ReportStorage } from '../files/report.storage';

function isObjectId(id: string): boolean {
  return Types.ObjectId.isValid(id);
}

function canAccessConsultation(user: { id: string; role: string }, c: any): boolean {
  const patientId = String(c?.patientId?._id || c?.patientId || '');
  const doctorId = String(c?.doctorId?._id || c?.doctorId || '');

  if (user.role === 'ADMIN') return c.status !== 'SCHEDULED';
  if (user.role === 'PATIENT') return patientId === user.id;
  if (user.role === 'DOCTOR') return doctorId === user.id;
  return false;
}

type UploadedReportFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

type CallSignalType = 'offer' | 'answer' | 'ice-candidate' | 'hangup';
type CallSignalRole = 'DOCTOR' | 'PATIENT';

type CallSignal = {
  id: number;
  fromUserId: string;
  fromRole: CallSignalRole;
  toRole: CallSignalRole;
  type: CallSignalType;
  payload: unknown;
  createdAt: string;
};

export class ConsultationController {
  private static callSignalsByConsultation = new Map<string, { seq: number; items: CallSignal[] }>();

  private static getCallSignalBucket(consultationId: string) {
    const existing = ConsultationController.callSignalsByConsultation.get(consultationId);
    if (existing) return existing;
    const bucket = { seq: 0, items: [] as CallSignal[] };
    ConsultationController.callSignalsByConsultation.set(consultationId, bucket);
    return bucket;
  }

  private static getCounterpartRole(role: CallSignalRole): CallSignalRole {
    return role === 'DOCTOR' ? 'PATIENT' : 'DOCTOR';
  }

  private static isCallParticipant(req: Request, consultation: any): req is Request & { user: { id: string; role: CallSignalRole } } {
    if (!req.user) return false;
    if (req.user.role !== 'DOCTOR' && req.user.role !== 'PATIENT') return false;
    return canAccessConsultation(req.user, consultation);
  }

  // Patient books a consultation with an approved doctor
  static async create(req: Request, res: Response) {
    if (!req.user) return fail(res, 401, { message: 'Unauthorized' });

    const { doctorId, scheduledAt } = req.body as {
      doctorId?: string;
      scheduledAt?: string;
    };

    if (!doctorId || !isObjectId(doctorId)) return fail(res, 400, { message: 'Invalid doctorId' });

    const doctor = await User.findOne({ _id: doctorId, role: 'DOCTOR' });
    if (!doctor) return fail(res, 404, { message: 'Doctor not found' });
    if (!doctor.approved) return fail(res, 403, { message: 'Doctor is not approved yet' });

    const existingActive = await Consultation.findOne({
      patientId: req.user.id,
      doctorId,
      status: { $in: ['REQUESTED', 'SCHEDULED', 'IN_PROGRESS'] }
    }).select('_id status scheduledAt');
    if (existingActive) {
      return fail(res, 409, {
        message: 'You already have an active consultation with this doctor. Please continue the existing one.'
      });
    }

    const consultation = await Consultation.create({
      patientId: new Types.ObjectId(req.user.id),
      doctorId: new Types.ObjectId(doctorId),
      status: scheduledAt ? 'SCHEDULED' : 'REQUESTED',
      scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
      paymentStatus: 'PENDING',
      payment: {
        provider: 'MOCK_RAZORPAY',
        amount:
          typeof doctor.consultationFee === 'number' && Number.isFinite(doctor.consultationFee) && doctor.consultationFee > 0
            ? Math.round(doctor.consultationFee)
            : 499,
        currency: 'INR'
      },
      chat: [],
      reports: []
    });

    const populated = await Consultation.findById(consultation._id)
      .populate('doctorId', 'name email specialization role approved')
      .populate('patientId', 'name email role');

    return created(res, populated ?? consultation, 'Consultation booked (payment pending)');
  }

  static async my(req: Request, res: Response) {
    if (!req.user) return fail(res, 401, { message: 'Unauthorized' });

    const filter =
      req.user.role === 'PATIENT'
        ? { patientId: req.user.id, status: { $ne: 'COMPLETED' } }
        : req.user.role === 'DOCTOR'
          ? { doctorId: req.user.id, status: { $ne: 'COMPLETED' } }
          : { status: { $nin: ['SCHEDULED', 'COMPLETED'] } };

    const consultations = await Consultation.find(filter)
      .populate('doctorId', 'name email specialization role approved')
      .populate('patientId', 'name email role')
      .sort({ createdAt: -1 });
    return ok(res, consultations, 'My consultations');
  }

  static async getById(req: Request, res: Response) {
    if (!req.user) return fail(res, 401, { message: 'Unauthorized' });

    const c = await Consultation.findById(req.params.id)
      .populate('doctorId', 'name email specialization role approved')
      .populate('patientId', 'name email role');
    if (!c) return fail(res, 404, { message: 'Consultation not found' });
    if (!canAccessConsultation(req.user, c)) return fail(res, 403, { message: 'Forbidden' });

    return ok(res, c, 'Consultation');
  }

  static async addMessage(req: Request, res: Response) {
    if (!req.user) return fail(res, 401, { message: 'Unauthorized' });

    const c = await Consultation.findById(req.params.id);
    if (!c) return fail(res, 404, { message: 'Consultation not found' });
    if (!canAccessConsultation(req.user, c)) return fail(res, 403, { message: 'Forbidden' });

    // Doctor must be approved to chat
    if (req.user.role === 'DOCTOR') {
      const doctor = await User.findById(req.user.id);
      if (!doctor || !doctor.approved) return fail(res, 403, { message: 'Doctor not approved' });
    }
    if (req.user.role === 'PATIENT' && c.paymentStatus !== 'PAID') {
      return fail(res, 402, { message: 'Payment required before chat' });
    }

    const { message } = req.body as { message?: string };
    if (!message?.trim()) return fail(res, 400, { message: 'Message is required' });

    c.chat.push({
      senderRole: req.user.role === 'DOCTOR' ? 'DOCTOR' : 'PATIENT',
      senderId: new Types.ObjectId(req.user.id),
      message: message.trim(),
      createdAt: new Date()
    });

    if (c.status === 'REQUESTED' || c.status === 'SCHEDULED') c.status = 'IN_PROGRESS';

    await c.save();
    return ok(res, c, 'Message added');
  }

  static async uploadReport(req: Request, res: Response) {
    if (!req.user) return fail(res, 401, { message: 'Unauthorized' });

    const c = await Consultation.findById(req.params.id);
    if (!c) return fail(res, 404, { message: 'Consultation not found' });

    if (req.user.role !== 'PATIENT' || String(c.patientId) !== req.user.id) {
      return fail(res, 403, { message: 'Only the patient can upload reports' });
    }

    const file = (req as any).file as UploadedReportFile | undefined;
    if (!file) return fail(res, 400, { message: 'file is required (multipart/form-data)' });

    const stored = await ReportStorage.saveReport({
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
    return ok(res, c, 'Report uploaded');
  }

  static async viewReport(req: Request, res: Response) {
    if (!req.user) return fail(res, 401, { message: 'Unauthorized' });

    const c = await Consultation.findById(req.params.id);
    if (!c) return fail(res, 404, { message: 'Consultation not found' });
    if (!canAccessConsultation(req.user, c)) return fail(res, 403, { message: 'Forbidden' });

    const fileId = req.params.fileId;
    if (!Types.ObjectId.isValid(fileId)) return fail(res, 400, { message: 'Invalid fileId' });

    const expectedPath = `/api/consultations/${c.id}/reports/${fileId}/view`;
    const existsOnConsultation = (c.reports || []).some((r) => r.path === expectedPath);
    if (!existsOnConsultation) return fail(res, 404, { message: 'Report not linked to consultation' });

    const file = await ReportStorage.getReportFile(fileId);
    if (!file) return fail(res, 404, { message: 'Report file not found' });

    const mimeType = (file.metadata as { mimeType?: string } | undefined)?.mimeType;
    res.setHeader('Content-Type', mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename=\"${file.filename}\"`);

    const stream = ReportStorage.openDownloadStream(fileId);
    stream.on('error', () => {
      if (!res.headersSent) return fail(res, 500, { message: 'Failed to read report file' });
      res.end();
    });
    stream.pipe(res);
  }

  // Mock Razorpay: create order
  static async mockCreateOrder(req: Request, res: Response) {
    if (!req.user) return fail(res, 401, { message: 'Unauthorized' });

    const c = await Consultation.findById(req.params.id);
    if (!c) return fail(res, 404, { message: 'Consultation not found' });
    if (req.user.role !== 'PATIENT' || String(c.patientId) !== req.user.id) {
      return fail(res, 403, { message: 'Forbidden' });
    }
    if (c.status !== 'IN_PROGRESS') {
      return fail(res, 400, { message: 'Doctor approval required before payment' });
    }

    const orderId = `order_mock_${crypto.randomBytes(8).toString('hex')}`;
    c.payment = {
      provider: 'MOCK_RAZORPAY',
      amount: c.payment?.amount ?? 499,
      currency: c.payment?.currency ?? 'INR',
      orderId
    };
    c.paymentStatus = 'PENDING';
    await c.save();

    return ok(
      res,
      {
        keyId: env.razorpayKeyId,
        orderId,
        amount: c.payment.amount,
        currency: c.payment.currency
      },
      'Mock order created'
    );
  }

  // Mock Razorpay: verify payment
  static async mockVerifyPayment(req: Request, res: Response) {
    if (!req.user) return fail(res, 401, { message: 'Unauthorized' });

    const c = await Consultation.findById(req.params.id);
    if (!c) return fail(res, 404, { message: 'Consultation not found' });
    if (req.user.role !== 'PATIENT' || String(c.patientId) !== req.user.id) {
      return fail(res, 403, { message: 'Forbidden' });
    }
    if (c.status !== 'IN_PROGRESS') {
      return fail(res, 400, { message: 'Doctor approval required before payment verification' });
    }

    const { paymentId } = req.body as { paymentId?: string };
    if (!c.payment?.orderId) return fail(res, 400, { message: 'No order found. Create order first.' });

    const pid = paymentId || `pay_mock_${crypto.randomBytes(8).toString('hex')}`;
    // Simple mock signature
    const signature = crypto
      .createHmac('sha256', env.razorpayKeySecret)
      .update(`${c.payment.orderId}|${pid}`)
      .digest('hex');

    c.payment.paymentId = pid;
    c.payment.signature = signature;
    c.paymentStatus = 'PAID';
    await c.save();

    return ok(res, { consultationId: c.id, paymentStatus: c.paymentStatus }, 'Mock payment verified');
  }

  // Doctor: generate & store prescription
  static async generatePrescription(req: Request, res: Response) {
    if (!req.user) return fail(res, 401, { message: 'Unauthorized' });

    const c = await Consultation.findById(req.params.id);
    if (!c) return fail(res, 404, { message: 'Consultation not found' });
    if (req.user.role !== 'DOCTOR' || String(c.doctorId) !== req.user.id) {
      return fail(res, 403, { message: 'Only the assigned doctor can generate prescription' });
    }

    const doctor = await User.findById(req.user.id);
    if (!doctor || !doctor.approved) return fail(res, 403, { message: 'Doctor not approved' });

    if (c.status !== 'IN_PROGRESS') {
      return fail(res, 400, { message: 'Consultation must be approved by doctor before prescription generation' });
    }
    if (c.paymentStatus !== 'PAID') return fail(res, 402, { message: 'Payment required before prescription generation' });

    try {
      const prescription = await PrescriptionService.generateAndStore(c.id);
      c.status = 'COMPLETED';
      await c.save();
      return ok(res, prescription, 'Prescription generated');
    } catch (err: any) {
      return fail(res, err.status || 500, { message: err.message || 'Server error' });
    }
  }

  static async saveDoctorPrescription(req: Request, res: Response) {
    if (!req.user) return fail(res, 401, { message: 'Unauthorized' });

    const c = await Consultation.findById(req.params.id);
    if (!c) return fail(res, 404, { message: 'Consultation not found' });
    if (req.user.role !== 'DOCTOR' || String(c.doctorId) !== req.user.id) {
      return fail(res, 403, { message: 'Only the assigned doctor can save prescription' });
    }

    const doctor = await User.findById(req.user.id);
    if (!doctor || !doctor.approved) return fail(res, 403, { message: 'Doctor not approved' });

    if (c.status !== 'IN_PROGRESS') {
      return fail(res, 400, { message: 'Consultation must be approved by doctor before prescription generation' });
    }
    if (c.paymentStatus !== 'PAID') return fail(res, 402, { message: 'Payment required before prescription generation' });

    const { text } = req.body as { text?: string };
    if (!text?.trim()) return fail(res, 400, { message: 'Prescription text is required' });

    try {
      const prescription = await PrescriptionService.saveManual(c.id, text);
      return ok(res, prescription, 'Prescription saved');
    } catch (err: any) {
      return fail(res, err.status || 500, { message: err.message || 'Server error' });
    }
  }

  // Patient: view prescriptions for themselves (via consultation route for MVP)
  static async myPrescriptions(req: Request, res: Response) {
    if (!req.user) return fail(res, 401, { message: 'Unauthorized' });

    if (req.user.role === 'PATIENT') {
      const prescriptions = await PrescriptionService.listForPatient(req.user.id);
      return ok(res, prescriptions, 'My prescriptions');
    }

    if (req.user.role === 'DOCTOR') {
      const prescriptions = await PrescriptionService.listForDoctor(req.user.id);
      return ok(res, prescriptions, 'My issued prescriptions');
    }

    return fail(res, 403, { message: 'Forbidden' });
  }

  static async doctorCompleteAndDelete(req: Request, res: Response) {
    if (!req.user) return fail(res, 401, { message: 'Unauthorized' });

    const c = await Consultation.findById(req.params.id);
    if (!c) return fail(res, 404, { message: 'Consultation not found' });

    if (req.user.role !== 'DOCTOR' || String(c.doctorId) !== req.user.id) {
      return fail(res, 403, { message: 'Only the assigned doctor can mark done' });
    }

    if (c.status !== 'IN_PROGRESS') {
      return fail(res, 400, { message: 'Consultation can be deleted only when status is IN_PROGRESS' });
    }

    await Prescription.deleteMany({ consultationId: c._id });
    await c.deleteOne();
    ConsultationController.callSignalsByConsultation.delete(String(c._id));

    return ok(res, { consultationId: req.params.id, deleted: true }, 'Consultation marked done and deleted');
  }

  static async doctorApproveScheduled(req: Request, res: Response) {
    if (!req.user) return fail(res, 401, { message: 'Unauthorized' });

    const c = await Consultation.findById(req.params.id);
    if (!c) return fail(res, 404, { message: 'Consultation not found' });

    if (req.user.role !== 'DOCTOR' || String(c.doctorId) !== req.user.id) {
      return fail(res, 403, { message: 'Only the assigned doctor can approve consultation' });
    }

    const doctor = await User.findById(req.user.id);
    if (!doctor || !doctor.approved) return fail(res, 403, { message: 'Doctor not approved' });

    if (c.status !== 'SCHEDULED' && c.status !== 'REQUESTED') {
      return fail(res, 400, { message: 'Only scheduled/requested consultations can be approved' });
    }

    c.status = 'IN_PROGRESS';
    await c.save();

    return ok(res, { consultationId: c.id, status: c.status }, 'Consultation approved by doctor');
  }

  static async sendCallSignal(req: Request, res: Response) {
    if (!req.user) return fail(res, 401, { message: 'Unauthorized' });

    const c = await Consultation.findById(req.params.id);
    if (!c) return fail(res, 404, { message: 'Consultation not found' });
    if (!ConsultationController.isCallParticipant(req, c)) {
      return fail(res, 403, { message: 'Only assigned doctor/patient can use call signaling' });
    }
    if (c.status !== 'IN_PROGRESS') {
      return fail(res, 400, { message: 'Consultation must be approved by doctor before call' });
    }
    if (c.paymentStatus !== 'PAID') {
      return fail(res, 402, { message: 'Payment required before call' });
    }

    const { type, payload, toRole } = req.body as {
      type?: CallSignalType;
      payload?: unknown;
      toRole?: CallSignalRole;
    };

    const allowedTypes: CallSignalType[] = ['offer', 'answer', 'ice-candidate', 'hangup'];
    if (!type || !allowedTypes.includes(type)) {
      return fail(res, 400, { message: 'Invalid signal type' });
    }

    const targetRole = toRole || ConsultationController.getCounterpartRole(req.user.role);
    if (targetRole !== 'DOCTOR' && targetRole !== 'PATIENT') {
      return fail(res, 400, { message: 'Invalid toRole' });
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

    return ok(res, { signalId: bucket.seq }, 'Call signal sent');
  }

  static async getCallSignals(req: Request, res: Response) {
    if (!req.user) return fail(res, 401, { message: 'Unauthorized' });

    const c = await Consultation.findById(req.params.id);
    if (!c) return fail(res, 404, { message: 'Consultation not found' });
    if (!ConsultationController.isCallParticipant(req, c)) {
      return fail(res, 403, { message: 'Only assigned doctor/patient can use call signaling' });
    }
    if (c.status !== 'IN_PROGRESS') {
      return fail(res, 400, { message: 'Consultation must be approved by doctor before call' });
    }
    if (c.paymentStatus !== 'PAID') {
      return fail(res, 402, { message: 'Payment required before call' });
    }

    const since = Number(req.query.since || 0);
    const sinceId = Number.isFinite(since) ? since : 0;

    const bucket = ConsultationController.getCallSignalBucket(c.id);
    const signals = bucket.items.filter(
      (s) => s.id > sinceId && s.toRole === req.user.role && s.fromUserId !== req.user.id
    );

    return ok(
      res,
      {
        signals,
        lastId: bucket.seq
      },
      'Call signals'
    );
  }
}
