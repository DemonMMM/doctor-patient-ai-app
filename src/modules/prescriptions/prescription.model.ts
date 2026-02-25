import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IPrescription extends Document {
  consultationId: Types.ObjectId;
  doctorId: Types.ObjectId;
  patientId: Types.ObjectId;
  text: string;
  createdAt: Date;
  updatedAt: Date;
}

const PrescriptionSchema = new Schema<IPrescription>(
  {
    consultationId: { type: Schema.Types.ObjectId, required: true, ref: 'Consultation', index: true },
    doctorId: { type: Schema.Types.ObjectId, required: true, ref: 'User', index: true },
    patientId: { type: Schema.Types.ObjectId, required: true, ref: 'User', index: true },
    text: { type: String, required: true }
  },
  { timestamps: true }
);

export const Prescription = mongoose.model<IPrescription>('Prescription', PrescriptionSchema);
