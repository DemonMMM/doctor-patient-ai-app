"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserController = void 0;
const user_model_1 = require("./user.model");
const response_1 = require("../../utils/response");
class UserController {
    static async listApprovedDoctors(req, res) {
        const doctors = await user_model_1.User.find({ role: 'DOCTOR', approved: true })
            .select('-passwordHash')
            .sort({ name: 1 });
        return (0, response_1.ok)(res, doctors, 'Approved doctors');
    }
    static async me(req, res) {
        if (!req.user)
            return (0, response_1.fail)(res, 401, { message: 'Unauthorized' });
        const user = await user_model_1.User.findById(req.user.id).select('-passwordHash');
        if (!user)
            return (0, response_1.fail)(res, 404, { message: 'User not found' });
        return (0, response_1.ok)(res, user, 'Profile');
    }
    static async listPendingDoctors(req, res) {
        const doctors = await user_model_1.User.find({ role: 'DOCTOR', approved: false }).select('-passwordHash');
        return (0, response_1.ok)(res, doctors, 'Pending doctors');
    }
    static async listDoctorsForAdmin(req, res) {
        const doctors = await user_model_1.User.find({ role: 'DOCTOR' })
            .select('-passwordHash')
            .sort({ approved: -1, name: 1 });
        return (0, response_1.ok)(res, doctors, 'Doctors');
    }
    static async setDoctorConsultationFee(req, res) {
        const { doctorId } = req.params;
        const { consultationFee } = req.body;
        if (typeof consultationFee !== 'number' || !Number.isFinite(consultationFee) || consultationFee <= 0) {
            return (0, response_1.fail)(res, 400, { message: 'consultationFee must be a positive number' });
        }
        const doctor = await user_model_1.User.findOne({ _id: doctorId, role: 'DOCTOR' });
        if (!doctor)
            return (0, response_1.fail)(res, 404, { message: 'Doctor not found' });
        doctor.consultationFee = Math.round(consultationFee);
        await doctor.save();
        return (0, response_1.ok)(res, { id: doctor.id, consultationFee: doctor.consultationFee, approved: doctor.approved }, 'Consultation fee updated');
    }
    static async approveDoctor(req, res) {
        const { doctorId } = req.params;
        const doctor = await user_model_1.User.findOne({ _id: doctorId, role: 'DOCTOR' });
        if (!doctor)
            return (0, response_1.fail)(res, 404, { message: 'Doctor not found' });
        doctor.approved = true;
        await doctor.save();
        return (0, response_1.ok)(res, { id: doctor.id, approved: doctor.approved }, 'Doctor approved');
    }
    static async adminStats(req, res) {
        const [usersTotal, doctorsTotal, doctorsPending, patientsTotal] = await Promise.all([
            user_model_1.User.countDocuments({}),
            user_model_1.User.countDocuments({ role: 'DOCTOR' }),
            user_model_1.User.countDocuments({ role: 'DOCTOR', approved: false }),
            user_model_1.User.countDocuments({ role: 'PATIENT' })
        ]);
        return (0, response_1.ok)(res, {
            usersTotal,
            doctorsTotal,
            doctorsPending,
            patientsTotal
        }, 'Platform stats');
    }
}
exports.UserController = UserController;
