import { createApp } from './app';
import { connectDB } from './config/db';
import { env } from './config/env';
import { User } from './modules/users/user.model';
import bcrypt from 'bcryptjs';

async function ensureAdminSeed() {
  // Minimal seed: if no admin exists, create one using env defaults.
  // For a real system, you'd have a dedicated seeding command and secure credential flow.
  const existingAdmin = await User.findOne({ role: 'ADMIN' });
  if (existingAdmin) return;

  const email = process.env.ADMIN_EMAIL || 'admin@example.com';
  const password = process.env.ADMIN_PASSWORD || 'Admin@12345';

  const passwordHash = await bcrypt.hash(password, 10);
  await User.create({
    name: 'Admin',
    email,
    passwordHash,
    role: 'ADMIN',
    approved: true
  });

  // eslint-disable-next-line no-console
  console.log(`Seeded admin account: ${email}`);
}

async function bootstrap() {
  await connectDB();
  await ensureAdminSeed();

  const app = createApp();

  app.listen(env.port, () => {
    // eslint-disable-next-line no-console
    console.log(`Server listening on port ${env.port} (${env.nodeEnv})`);
  });
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal startup error:', err);
  process.exit(1);
});
