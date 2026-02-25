# AI-Powered Doctor–Patient Consultation App (MVP)

Backend MVP built with **Node.js + Express + TypeScript + MongoDB (Mongoose)**.

## Features
- JWT auth + role-based access control (**Admin / Doctor / Patient**)
- Doctor registration with **admin approval**
- Patient registration
- Consultation booking
- Chat-based consultation (stored in MongoDB)
- Upload medical reports (local storage)
- Mock payments (Razorpay-like flow, **no real API calls**)
- AI:
  - Medical chat summary
  - Diagnosis & treatment suggestions
  - Prescription text generation

## Setup

### 1) Install
```bash
npm install
```

### 2) Configure env
```bash
cp .env.example .env
```
Edit `.env` values (MongoDB, JWT secret, OpenAI key).

### 3) Run
```bash
npm run dev
```
Server starts on `http://localhost:4000` (or `PORT`).

## API Overview

Base URL: `/api`

### Auth
- `POST /api/auth/register` (role: `DOCTOR` or `PATIENT`)
- `POST /api/auth/login`

### Admin
- `GET /api/users/pending-doctors` (ADMIN)
- `PATCH /api/users/approve-doctor/:doctorId` (ADMIN)
- `GET /api/users/admin/stats` (ADMIN)

### Consultations
- `POST /api/consultations` (PATIENT) create booking
- `GET /api/consultations/my` (PATIENT/DOCTOR) list assigned
- `GET /api/consultations/:id` (owner/assigned/admin)
- `POST /api/consultations/:id/messages` (PATIENT/DOCTOR) add chat message
- `POST /api/consultations/:id/reports` (PATIENT) upload report (multipart/form-data `file`)

### Payments (Mock)
- `POST /api/consultations/:id/payment/mock/create-order` (PATIENT)
- `POST /api/consultations/:id/payment/mock/verify` (PATIENT)

### AI
- `POST /api/consultations/:id/ai/summary` (DOCTOR/ADMIN)
- `POST /api/consultations/:id/ai/suggestions` (DOCTOR/ADMIN)
- `POST /api/consultations/:id/ai/prescription` (DOCTOR) generate & store prescription

## Notes
- Uploads go to `UPLOAD_DIR` (default `uploads/`) and are served at `/uploads/...`
- Doctors cannot consult until `approved=true`
- This is an MVP: consider adding audit logs, rate limiting, refresh tokens, and encryption for production.
