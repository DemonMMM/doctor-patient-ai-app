"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.Consultation = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const ChatMessageSchema = new mongoose_1.Schema({
    senderRole: { type: String, required: true, enum: ['DOCTOR', 'PATIENT'] },
    senderId: { type: mongoose_1.Schema.Types.ObjectId, required: true, ref: 'User' },
    message: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
}, { _id: false });
const ReportSchema = new mongoose_1.Schema({
    originalName: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    path: { type: String, required: true },
    uploadedAt: { type: Date, default: Date.now }
}, { _id: false });
const ConsultationSchema = new mongoose_1.Schema({
    patientId: { type: mongoose_1.Schema.Types.ObjectId, required: true, ref: 'User' },
    doctorId: { type: mongoose_1.Schema.Types.ObjectId, required: true, ref: 'User' },
    status: {
        type: String,
        required: true,
        enum: ['REQUESTED', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
        default: 'REQUESTED'
    },
    scheduledAt: { type: Date },
    paymentStatus: { type: String, enum: ['PENDING', 'PAID', 'FAILED', 'REFUNDED'], default: 'PENDING' },
    payment: {
        provider: { type: String, enum: ['MOCK_RAZORPAY'], default: 'MOCK_RAZORPAY' },
        orderId: { type: String },
        paymentId: { type: String },
        signature: { type: String },
        amount: { type: Number, required: true },
        currency: { type: String, default: 'INR' }
    },
    chat: { type: [ChatMessageSchema], default: [] },
    reports: { type: [ReportSchema], default: [] },
    ai: {
        summary: { type: String },
        suggestions: { type: String }
    }
}, { timestamps: true });
exports.Consultation = mongoose_1.default.model('Consultation', ConsultationSchema);
