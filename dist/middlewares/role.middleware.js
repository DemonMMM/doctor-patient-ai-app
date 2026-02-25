"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireRole = requireRole;
const response_1 = require("../utils/response");
function requireRole(...roles) {
    return (req, res, next) => {
        const user = req.user;
        if (!user)
            return (0, response_1.fail)(res, 401, { message: 'Unauthorized' });
        if (!roles.includes(user.role))
            return (0, response_1.fail)(res, 403, { message: 'Forbidden' });
        return next();
    };
}
