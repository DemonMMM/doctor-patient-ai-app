"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = require("./app");
const db_1 = require("./config/db");
const env_1 = require("./config/env");
const user_model_1 = require("./modules/users/user.model");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
async function ensureAdminSeed() {
    // Minimal seed: if no admin exists, create one using env defaults.
    // For a real system, you'd have a dedicated seeding command and secure credential flow.
    const existingAdmin = await user_model_1.User.findOne({ role: 'ADMIN' });
    if (existingAdmin)
        return;
    const email = process.env.ADMIN_EMAIL || 'admin@example.com';
    const password = process.env.ADMIN_PASSWORD || 'Admin@12345';
    const passwordHash = await bcryptjs_1.default.hash(password, 10);
    await user_model_1.User.create({
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
    await (0, db_1.connectDB)();
    await ensureAdminSeed();
    const app = (0, app_1.createApp)();
    app.listen(env_1.env.port, () => {
        // eslint-disable-next-line no-console
        console.log(`Server listening on port ${env_1.env.port} (${env_1.env.nodeEnv})`);
    });
}
bootstrap().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Fatal startup error:', err);
    process.exit(1);
});
