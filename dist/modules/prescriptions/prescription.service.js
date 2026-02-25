"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PrescriptionService = void 0;
const mongoose_1 = require("mongoose");
const consultation_model_1 = require("../consultations/consultation.model");
const prescription_model_1 = require("./prescription.model");
const ai_service_1 = require("../ai/ai.service");
function chatToTranscript(chat) {
    return chat
        .map((m) => `[${new Date(m.createdAt).toISOString()}] ${m.senderRole}: ${m.message}`)
        .join('\n');
}
class PrescriptionService {
    static async generateAndStore(consultationId) {
        const consultation = await consultation_model_1.Consultation.findById(consultationId);
        if (!consultation) {
            throw Object.assign(new Error('Consultation not found'), { status: 404 });
        }
        const transcript = chatToTranscript(consultation.chat);
        if (!transcript.trim()) {
            throw Object.assign(new Error('No chat messages available'), { status: 400 });
        }
        const text = await ai_service_1.AIService.generatePrescriptionText(transcript);
        const prescription = await prescription_model_1.Prescription.create({
            consultationId: new mongoose_1.Types.ObjectId(consultation.id),
            doctorId: consultation.doctorId,
            patientId: consultation.patientId,
            text
        });
        return prescription;
    }
    static async listForPatient(patientId) {
        return prescription_model_1.Prescription.find({ patientId }).sort({ createdAt: -1 });
    }
    static async listForDoctor(doctorId) {
        return prescription_model_1.Prescription.find({ doctorId }).sort({ createdAt: -1 });
    }
}
exports.PrescriptionService = PrescriptionService;
