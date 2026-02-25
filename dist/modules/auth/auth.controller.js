"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthController = void 0;
const auth_service_1 = require("./auth.service");
const response_1 = require("../../utils/response");
class AuthController {
    static async register(req, res) {
        try {
            const { name, email, password, role, specialization } = req.body;
            if (!name || !email || !password || !role) {
                return (0, response_1.fail)(res, 400, { message: 'Missing required fields' });
            }
            if (role !== 'DOCTOR' && role !== 'PATIENT') {
                return (0, response_1.fail)(res, 400, { message: 'Invalid role' });
            }
            const result = await auth_service_1.AuthService.register({ name, email, password, role, specialization });
            return (0, response_1.created)(res, result, role === 'DOCTOR' ? 'Doctor registered (pending approval)' : 'Patient registered');
        }
        catch (err) {
            return (0, response_1.fail)(res, err.status || 500, { message: err.message || 'Server error' });
        }
    }
    static async login(req, res) {
        try {
            const { email, password } = req.body;
            if (!email || !password) {
                return (0, response_1.fail)(res, 400, { message: 'Missing email or password' });
            }
            const result = await auth_service_1.AuthService.login(email, password);
            return (0, response_1.ok)(res, result, 'Logged in');
        }
        catch (err) {
            return (0, response_1.fail)(res, err.status || 500, { message: err.message || 'Server error' });
        }
    }
}
exports.AuthController = AuthController;
