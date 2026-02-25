"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AIService = void 0;
const openai_1 = __importDefault(require("openai"));
const env_1 = require("../../config/env");
class AIService {
    static client = null;
    static FALLBACK_SUMMARY = 'AI summary unavailable right now. Please review the consultation chat manually and document key symptoms, history, red flags, and next steps.';
    static FALLBACK_SUGGESTIONS = 'AI suggestions unavailable right now. Please proceed with clinical judgment, conservative guidance, and appropriate follow-up/testing recommendations.';
    static FALLBACK_PRESCRIPTION = 'AI prescription draft unavailable right now. Please create a manual prescription with assessment, medication plan (if applicable), instructions, follow-up, and disclaimer.';
    static getClient() {
        if (!env_1.env.openaiApiKey) {
            throw Object.assign(new Error('OPENAI_API_KEY not configured'), { status: 500 });
        }
        if (!AIService.client) {
            AIService.client = new openai_1.default({ apiKey: env_1.env.openaiApiKey });
        }
        return AIService.client;
    }
    static async run(prompt, fallback) {
        try {
            const client = AIService.getClient();
            const completion = await client.chat.completions.create({
                model: env_1.env.openaiModel,
                temperature: 0.2,
                messages: [
                    {
                        role: 'system',
                        content: 'You are a clinical documentation assistant. You do not provide definitive medical diagnosis. Use cautious language, suggest seeing a doctor for emergencies, and avoid unsafe medication advice. Output must be clear and structured.'
                    },
                    { role: 'user', content: prompt }
                ]
            });
            const content = completion.choices[0]?.message?.content?.trim();
            return content || fallback;
        }
        catch {
            return fallback;
        }
    }
    static async summarizeChat(chatTranscript) {
        const prompt = `Summarize the following doctor-patient consultation chat.

Requirements:
- Use headings: Chief Complaint, History, Symptoms, Relevant Negatives, Assessment (non-definitive), Red Flags, Next Steps
- Keep concise

Chat:\n${chatTranscript}`;
        return AIService.run(prompt, AIService.FALLBACK_SUMMARY);
    }
    static async suggestDiagnosisAndTreatment(chatTranscript) {
        const prompt = `Based on this consultation chat, suggest possible differential diagnoses and a conservative treatment/next-step plan.

Requirements:
- Provide Differential Diagnoses (with reasoning)
- Provide Home Care / OTC (safe, conservative)
- Provide When to seek urgent care
- Provide Tests / follow-up suggestions
- Avoid prescribing controlled meds

Chat:\n${chatTranscript}`;
        return AIService.run(prompt, AIService.FALLBACK_SUGGESTIONS);
    }
    static async generatePrescriptionText(chatTranscript) {
        const prompt = `Generate a draft digital prescription text based on the chat.

Requirements:
- Include: Patient Info (unknown fields as blank), Assessment (non-definitive), Medications (if appropriate, conservative), Instructions, Follow-up, Disclaimer
- Do not include controlled substances
- Use clear bullet points

Chat:\n${chatTranscript}`;
        return AIService.run(prompt, AIService.FALLBACK_PRESCRIPTION);
    }
}
exports.AIService = AIService;
