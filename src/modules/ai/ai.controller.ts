import { Request, Response } from 'express';
import { Consultation } from '../consultations/consultation.model';
import { AIService } from './ai.service';
import { fail, ok } from '../../utils/response';

function chatToTranscript(chat: Array<{ senderRole: string; message: string; createdAt: Date }>): string {
  return chat
    .map((m) => `[${new Date(m.createdAt).toISOString()}] ${m.senderRole}: ${m.message}`)
    .join('\n');
}

export class AIController {
  static async generateSummary(req: Request, res: Response) {
    const { id } = req.params;

    const consultation = await Consultation.findById(id);
    if (!consultation) return fail(res, 404, { message: 'Consultation not found' });

    const transcript = chatToTranscript(consultation.chat);
    if (!transcript.trim()) return fail(res, 400, { message: 'No chat messages to summarize' });

    const summary = await AIService.summarizeChat(transcript);
    consultation.ai = consultation.ai || {};
    consultation.ai.summary = summary;
    await consultation.save();

    return ok(res, { consultationId: consultation.id, summary }, 'AI summary generated');
  }

  static async generateSuggestions(req: Request, res: Response) {
    const { id } = req.params;

    const consultation = await Consultation.findById(id);
    if (!consultation) return fail(res, 404, { message: 'Consultation not found' });

    const transcript = chatToTranscript(consultation.chat);
    if (!transcript.trim()) return fail(res, 400, { message: 'No chat messages to analyze' });

    const suggestions = await AIService.suggestDiagnosisAndTreatment(transcript);
    consultation.ai = consultation.ai || {};
    consultation.ai.suggestions = suggestions;
    await consultation.save();

    return ok(res, { consultationId: consultation.id, suggestions }, 'AI suggestions generated');
  }

  static async generatePrescriptionDraft(req: Request, res: Response) {
    const { id } = req.params;

    const consultation = await Consultation.findById(id);
    if (!consultation) return fail(res, 404, { message: 'Consultation not found' });

    const transcript = chatToTranscript(consultation.chat);
    if (!transcript.trim()) return fail(res, 400, { message: 'No chat messages to generate prescription' });

    const text = await AIService.generatePrescriptionText(transcript);
    return ok(res, { consultationId: consultation.id, text }, 'AI prescription draft generated');
  }
}
