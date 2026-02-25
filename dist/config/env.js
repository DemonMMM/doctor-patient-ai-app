"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
function required(name) {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing required env var: ${name}`);
    }
    return value;
}
exports.env = {
    port: Number(process.env.PORT || 4000),
    nodeEnv: process.env.NODE_ENV || 'development',
    mongodbUri: required('MONGODB_URI'),
    jwtSecret: required('JWT_SECRET'),
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
    openaiApiKey: process.env.OPENAI_API_KEY || '',
    openaiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    webrtcIceServersJson: process.env.WEBRTC_ICE_SERVERS_JSON || '',
    uploadDir: process.env.UPLOAD_DIR || 'uploads',
    razorpayKeyId: process.env.RAZORPAY_KEY_ID || 'rzp_test_mock',
    razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET || 'mock_secret'
};
