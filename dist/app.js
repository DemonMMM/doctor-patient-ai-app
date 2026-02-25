"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApp = createApp;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const env_1 = require("./config/env");
const auth_routes_1 = require("./modules/auth/auth.routes");
const user_routes_1 = require("./modules/users/user.routes");
const consultation_routes_1 = require("./modules/consultations/consultation.routes");
const response_1 = require("./utils/response");
function defaultIceServers() {
    return [
        { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
        {
            urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443', 'turn:openrelay.metered.ca:443?transport=tcp'],
            username: 'openrelayproject',
            credential: 'openrelayproject'
        }
    ];
}
function resolveIceServers() {
    if (!env_1.env.webrtcIceServersJson)
        return defaultIceServers();
    try {
        const parsed = JSON.parse(env_1.env.webrtcIceServersJson);
        if (Array.isArray(parsed) && parsed.length > 0)
            return parsed;
    }
    catch {
        // Ignore malformed env and fallback to safe defaults for testing.
    }
    return defaultIceServers();
}
function createApp() {
    const app = (0, express_1.default)();
    const publicDir = path_1.default.resolve('public');
    // Ensure upload directory exists
    if (!fs_1.default.existsSync(env_1.env.uploadDir)) {
        fs_1.default.mkdirSync(env_1.env.uploadDir, { recursive: true });
    }
    app.use((0, cors_1.default)());
    app.use(express_1.default.json({ limit: '1mb' }));
    app.use(express_1.default.urlencoded({ extended: true }));
    // Serve uploads
    app.use('/uploads', express_1.default.static(path_1.default.resolve(env_1.env.uploadDir)));
    app.use(express_1.default.static(publicDir));
    // Health
    app.get('/health', (req, res) => res.json({ ok: true }));
    app.get('/api/config/rtc', (req, res) => {
        return (0, response_1.ok)(res, { iceServers: resolveIceServers() }, 'RTC config');
    });
    app.get('/', (req, res) => res.sendFile(path_1.default.join(publicDir, 'index.html')));
    // Routes
    app.use('/api/auth', auth_routes_1.authRouter);
    app.use('/api/users', user_routes_1.userRouter);
    app.use('/api/consultations', consultation_routes_1.consultationRouter);
    // 404
    app.use((req, res) => (0, response_1.fail)(res, 404, { message: 'Not found' }));
    // Error handler
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    app.use((err, req, res, next) => {
        const status = err?.status || 500;
        const message = err?.message || 'Server error';
        return (0, response_1.fail)(res, status, { message });
    });
    return app;
}
