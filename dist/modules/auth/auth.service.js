"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const user_model_1 = require("../users/user.model");
const jwt_1 = require("../../utils/jwt");
class AuthService {
    static async register(input) {
        const existing = await user_model_1.User.findOne({ email: input.email });
        if (existing) {
            const err = new Error('Email already in use');
            // @ts-expect-error attach status
            err.status = 409;
            throw err;
        }
        const passwordHash = await bcryptjs_1.default.hash(input.password, 10);
        const user = await user_model_1.User.create({
            name: input.name,
            email: input.email,
            passwordHash,
            role: input.role,
            approved: input.role === 'DOCTOR' ? false : true,
            specialization: input.role === 'DOCTOR' ? input.specialization : undefined
        });
        const token = (0, jwt_1.signToken)({ sub: user.id, role: user.role });
        return {
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                approved: user.role === 'DOCTOR' ? user.approved : undefined
            }
        };
    }
    static async login(email, password) {
        const user = await user_model_1.User.findOne({ email });
        if (!user) {
            const err = new Error('Invalid credentials');
            // @ts-expect-error attach status
            err.status = 401;
            throw err;
        }
        const ok = await bcryptjs_1.default.compare(password, user.passwordHash);
        if (!ok) {
            const err = new Error('Invalid credentials');
            // @ts-expect-error attach status
            err.status = 401;
            throw err;
        }
        const token = (0, jwt_1.signToken)({ sub: user.id, role: user.role });
        return {
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                approved: user.role === 'DOCTOR' ? user.approved : undefined
            }
        };
    }
}
exports.AuthService = AuthService;
