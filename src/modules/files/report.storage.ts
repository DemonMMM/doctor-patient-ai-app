import mongoose from 'mongoose';
import { mongo } from 'mongoose';

export type StoredReportFile = {
  _id: mongo.ObjectId;
  filename: string;
  length: number;
  mimeType?: string;
};

export class ReportStorage {
  private static bucket(): mongo.GridFSBucket {
    const db = mongoose.connection.db;
    if (!db) throw new Error('Database not connected');
    return new mongo.GridFSBucket(db, { bucketName: 'reports' });
  }

  static async saveReport(args: {
    buffer: Buffer;
    filename: string;
    contentType?: string;
    consultationId: string;
    uploadedByUserId: string;
  }): Promise<StoredReportFile> {
    const bucket = ReportStorage.bucket();
    const uploadStream = bucket.openUploadStream(args.filename, {
      metadata: {
        mimeType: args.contentType,
        consultationId: args.consultationId,
        uploadedByUserId: args.uploadedByUserId,
        uploadedAt: new Date().toISOString()
      }
    });

    await new Promise<void>((resolve, reject) => {
      uploadStream.on('finish', () => resolve());
      uploadStream.on('error', reject);
      uploadStream.end(args.buffer);
    });

    const id = uploadStream.id as mongo.ObjectId;
    const [file] = await bucket.find({ _id: id }).toArray();
    if (!file) throw new Error('Failed to persist report file');

    return {
      _id: file._id as mongo.ObjectId,
      filename: file.filename,
      length: file.length,
      mimeType: (file.metadata as { mimeType?: string } | undefined)?.mimeType
    };
  }

  static async getReportFile(fileId: string) {
    const bucket = ReportStorage.bucket();
    const _id = new mongo.ObjectId(fileId);
    const [file] = await bucket.find({ _id }).toArray();
    if (!file) return null;
    return file;
  }

  static openDownloadStream(fileId: string) {
    const bucket = ReportStorage.bucket();
    const _id = new mongo.ObjectId(fileId);
    return bucket.openDownloadStream(_id);
  }
}
