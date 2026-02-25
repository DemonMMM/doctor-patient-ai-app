import { Request, Response } from 'express';
import { User } from './user.model';
import { fail, ok } from '../../utils/response';

export class UserController {
  static async listApprovedDoctors(req: Request, res: Response) {
    const doctors = await User.find({ role: 'DOCTOR', approved: true })
      .select('-passwordHash')
      .sort({ name: 1 });
    return ok(res, doctors, 'Approved doctors');
  }

  static async me(req: Request, res: Response) {
    if (!req.user) return fail(res, 401, { message: 'Unauthorized' });

    const user = await User.findById(req.user.id).select('-passwordHash');
    if (!user) return fail(res, 404, { message: 'User not found' });

    return ok(res, user, 'Profile');
  }

  static async listPendingDoctors(req: Request, res: Response) {
    const doctors = await User.find({ role: 'DOCTOR', approved: false }).select('-passwordHash');
    return ok(res, doctors, 'Pending doctors');
  }

  static async listDoctorsForAdmin(req: Request, res: Response) {
    const doctors = await User.find({ role: 'DOCTOR' })
      .select('-passwordHash')
      .sort({ approved: -1, name: 1 });
    return ok(res, doctors, 'Doctors');
  }

  static async setDoctorConsultationFee(req: Request, res: Response) {
    const { doctorId } = req.params;
    const { consultationFee } = req.body as { consultationFee?: number };

    if (typeof consultationFee !== 'number' || !Number.isFinite(consultationFee) || consultationFee <= 0) {
      return fail(res, 400, { message: 'consultationFee must be a positive number' });
    }

    const doctor = await User.findOne({ _id: doctorId, role: 'DOCTOR' });
    if (!doctor) return fail(res, 404, { message: 'Doctor not found' });

    doctor.consultationFee = Math.round(consultationFee);
    await doctor.save();

    return ok(
      res,
      { id: doctor.id, consultationFee: doctor.consultationFee, approved: doctor.approved },
      'Consultation fee updated'
    );
  }

  static async approveDoctor(req: Request, res: Response) {
    const { doctorId } = req.params;
    const doctor = await User.findOne({ _id: doctorId, role: 'DOCTOR' });
    if (!doctor) return fail(res, 404, { message: 'Doctor not found' });

    doctor.approved = true;
    await doctor.save();

    return ok(res, { id: doctor.id, approved: doctor.approved }, 'Doctor approved');
  }

  static async adminStats(req: Request, res: Response) {
    const [usersTotal, doctorsTotal, doctorsPending, patientsTotal] = await Promise.all([
      User.countDocuments({}),
      User.countDocuments({ role: 'DOCTOR' }),
      User.countDocuments({ role: 'DOCTOR', approved: false }),
      User.countDocuments({ role: 'PATIENT' })
    ]);

    return ok(
      res,
      {
        usersTotal,
        doctorsTotal,
        doctorsPending,
        patientsTotal
      },
      'Platform stats'
    );
  }
}
