import mongoose, { Document, Schema, Types } from 'mongoose';

export type ConsultationStatus = 'REQUESTED' | 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type PaymentStatus = 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED';

export type ChatMessage = {
  senderRole: 'DOCTOR' | 'PATIENT';
  senderId: Types.ObjectId;
  message: string;
  createdAt: Date;
};

export type ReportFile = {
  originalName: string;
  mimeType: string;
  size: number;
  path: string;
  uploadedAt: Date;
};

export interface IConsultation extends Document {
  patientId: Types.ObjectId;
  doctorId: Types.ObjectId;
  status: ConsultationStatus;
  scheduledAt?: Date;
  paymentStatus: PaymentStatus;
  payment?: {
    provider: 'MOCK_RAZORPAY';
    orderId?: string;
    paymentId?: string;
    signature?: string;
    amount: number;
    currency: string;
  };
  chat: ChatMessage[];
  reports: ReportFile[];
  ai?: {
    summary?: string;
    suggestions?: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

const ChatMessageSchema = new Schema<ChatMessage>(
  {
    senderRole: { type: String, required: true, enum: ['DOCTOR', 'PATIENT'] },
    senderId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
    message: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
  },
  { _id: false }
);

const ReportSchema = new Schema<ReportFile>(
  {
    originalName: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    path: { type: String, required: true },
    uploadedAt: { type: Date, default: Date.now }
  },
  { _id: false }
);

const ConsultationSchema = new Schema<IConsultation>(
  {
    patientId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
    doctorId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
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
  },
  { timestamps: true }
);

export const Consultation = mongoose.model<IConsultation>('Consultation', ConsultationSchema);
