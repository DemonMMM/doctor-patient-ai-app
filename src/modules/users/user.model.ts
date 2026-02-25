import mongoose, { Document, Schema } from 'mongoose';

export type UserRole = 'ADMIN' | 'DOCTOR' | 'PATIENT';

export interface IUser extends Document {
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  approved?: boolean; // for doctors
  specialization?: string;
  consultationFee?: number;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, required: true, enum: ['ADMIN', 'DOCTOR', 'PATIENT'] },
    approved: { type: Boolean, default: false },
    specialization: { type: String },
    consultationFee: { type: Number, min: 1, default: 499 }
  },
  { timestamps: true }
);

export const User = mongoose.model<IUser>('User', UserSchema);
