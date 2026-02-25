import mongoose from 'mongoose';
import { env } from './env';

export async function connectDB(): Promise<void> {
  mongoose.set('strictQuery', true);

  await mongoose.connect(env.mongodbUri);

  // Basic connection logging
  mongoose.connection.on('connected', () => {
    // eslint-disable-next-line no-console
    console.log('MongoDB connected');
  });

  mongoose.connection.on('error', (err) => {
    // eslint-disable-next-line no-console
    console.error('MongoDB connection error:', err);
  });
}
