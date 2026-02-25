"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AIController = void 0;
const consultation_model_1 = require("../consultations/consultation.model");
const ai_service_1 = require("./ai.service");
const response_1 = require("../../utils/response");
function chatToTranscript(chat) {
    return chat
        .map((m) => `[${new Date(m.createdAt).toISOString()}] ${m.senderRole}: ${m.message}`)
        .join('\n');
}
class AIController {
    static async generateSummary(req, res) {
        const { id } = req.params;
        const consultation = await consultation_model_1.Consultation.findById(id);
        if (!consultation)
            return (0, response_1.fail)(res, 404, { message: 'Consultation not found' });
        const transcript = chatToTranscript(consultation.chat);
        if (!transcript.trim())
            return (0, response_1.fail)(res, 400, { message: 'No chat messages to summarize' });
        const summary = await ai_service_1.AIService.summarizeChat(transcript);
        consultation.ai = consultation.ai || {};
        consultation.ai.summary = summary;
        await consultation.save();
        return (0, response_1.ok)(res, { consultationId: consultation.id, summary }, 'AI summary generated');
    }
    static async generateSuggestions(req, res) {
        const { id } = req.params;
        const consultation = await consultation_model_1.Consultation.findById(id);
        if (!consultation)
            return (0, response_1.fail)(res, 404, { message: 'Consultation not found' });
        const transcript = chatToTranscript(consultation.chat);
        if (!transcript.trim())
            return (0, response_1.fail)(res, 400, { message: 'No chat messages to analyze' });
        const suggestions = await ai_service_1.AIService.suggestDiagnosisAndTreatment(transcript);
        consultation.ai = consultation.ai || {};
        consultation.ai.suggestions = suggestions;
        await consultation.save();
        return (0, response_1.ok)(res, { consultationId: consultation.id, suggestions }, 'AI suggestions generated');
    }
    static async generatePrescriptionDraft(req, res) {
        const { id } = req.params;
        const consultation = await consultation_model_1.Consultation.findById(id);
        if (!consultation)
            return (0, response_1.fail)(res, 404, { message: 'Consultation not found' });
        const transcript = chatToTranscript(consultation.chat);
        if (!transcript.trim())
            return (0, response_1.fail)(res, 400, { message: 'No chat messages to generate prescription' });
        const text = await ai_service_1.AIService.generatePrescriptionText(transcript);
        return (0, response_1.ok)(res, { consultationId: consultation.id, text }, 'AI prescription draft generated');
    }
}
exports.AIController = AIController;
