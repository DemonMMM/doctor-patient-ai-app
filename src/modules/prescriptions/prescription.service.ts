import { Types } from 'mongoose';
import { Consultation } from '../consultations/consultation.model';
import { Prescription } from './prescription.model';
import { AIService } from '../ai/ai.service';

function chatToTranscript(chat: Array<{ senderRole: string; message: string; createdAt: Date }>): string {
  return chat
    .map((m) => `[${new Date(m.createdAt).toISOString()}] ${m.senderRole}: ${m.message}`)
    .join('\n');
}

export class PrescriptionService {
  static async generateAndStore(consultationId: string) {
    const consultation = await Consultation.findById(consultationId);
    if (!consultation) {
      throw Object.assign(new Error('Consultation not found'), { status: 404 });
    }

    const transcript = chatToTranscript(consultation.chat);
    if (!transcript.trim()) {
      throw Object.assign(new Error('No chat messages available'), { status: 400 });
    }

    const text = await AIService.generatePrescriptionText(transcript);

    const prescription = await Prescription.create({
      consultationId: new Types.ObjectId(consultation.id),
      doctorId: consultation.doctorId,
      patientId: consultation.patientId,
      text
    });

    return prescription;
  }

  static async listForPatient(patientId: string) {
    return Prescription.find({ patientId }).sort({ createdAt: -1 });
  }

  static async listForDoctor(doctorId: string) {
    return Prescription.find({ doctorId }).sort({ createdAt: -1 });
  }
}
