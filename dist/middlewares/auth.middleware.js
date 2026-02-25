"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = requireAuth;
const jwt_1 = require("../utils/jwt");
const response_1 = require("../utils/response");
function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        return (0, response_1.fail)(res, 401, { message: 'Unauthorized' });
    }
    const token = authHeader.slice('Bearer '.length);
    try {
        const payload = (0, jwt_1.verifyToken)(token);
        req.user = { id: payload.sub, role: payload.role };
        return next();
    }
    catch {
        return (0, response_1.fail)(res, 401, { message: 'Invalid or expired token' });
    }
}
