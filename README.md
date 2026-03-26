# MediFlow

A modern doctor-patient consultation platform with role-based workflows, AI-assisted clinical tools, secure auth, online report storage, and Android app support.

## Why MediFlow

MediFlow is built for a complete consultation lifecycle:

- Patient books consultation
- Doctor approves
- Patient completes payment
- Chat + reports + video consultation
- AI summary/suggestions/prescription support
- Doctor can also write manual prescription

---

## Stack

| Layer | Tech |
|---|---|
| Backend | Node.js, Express, TypeScript |
| Database | MongoDB + Mongoose |
| Auth | JWT + role-based access |
| AI | OpenAI API |
| Web UI | React (bundled static app) |
| Mobile | Capacitor Android |
| File Storage | MongoDB GridFS (reports) |

---

## Features

### Auth and Roles
- JWT login/register
- Roles: `ADMIN`, `DOCTOR`, `PATIENT`
- Admin-only doctor approval

### Consultation Flow
- Patient creates consultation request
- Doctor approves consultation
- Payment required before call/chat (patient side restrictions)
- Doctor can mark consultation done

### Clinical Support
- AI summary generation
- AI suggestions generation
- AI prescription draft generation
- Manual doctor-written prescription save endpoint

### Communication
- In-consultation chat
- Video call signaling (doctor/patient only)
- Android local notifications for call/update events

### Reports
- Patient report upload
- Reports stored online in GridFS
- Access controlled report view endpoint

---

## Project Layout

```text
src/
  app.ts
  server.ts
  modules/
    auth/
    users/
    consultations/
    prescriptions/
    ai/
    files/
public/
  index.html
  app.jsx
  app.bundle.js
  call-engine.js
  call-pane.jsx
  styles.css
android/
```

---

## Quick Start

### 1) Install

```bash
npm install
```

### 2) Configure environment

Create `.env` in project root.

```env
# Server
PORT=4000
NODE_ENV=development

# MongoDB
MONGODB_URI=mongodb://127.0.0.1:27017/doctor_patient_ai_app

# JWT
JWT_SECRET=change_me_super_secret
JWT_EXPIRES_IN=7d

# OpenAI
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-4o-mini

# Legacy local storage var (reports now use GridFS)
UPLOAD_DIR=uploads

# Mock Razorpay
RAZORPAY_KEY_ID=rzp_test_mock
RAZORPAY_KEY_SECRET=mock_secret
```

### 3) Run backend

```bash
npm run dev
```

### 4) Build web bundle

```bash
npm run build:web
```

### 5) Open app

- App: `http://localhost:4000`
- Health: `http://localhost:4000/api/health`

---

## Scripts

```bash
npm run dev        # ts-node-dev server
npm run build:web  # bundle React app into public/app.bundle.js
npm run build      # compile TypeScript backend
npm start          # run compiled server from dist/
```

---

## API Overview

Base path: `/api`

### Auth
- `POST /auth/register`
- `POST /auth/login`

### Users/Admin
- `GET /users/me`
- `GET /users/doctors`
- `GET /users/pending-doctors` (ADMIN)
- `PATCH /users/approve-doctor/:doctorId` (ADMIN)
- `GET /users/admin/doctors` (ADMIN)
- `PATCH /users/admin/doctors/:doctorId/consultation-fee` (ADMIN)
- `GET /users/admin/stats` (ADMIN)

### Consultations
- `POST /consultations` (PATIENT)
- `GET /consultations/my`
- `GET /consultations/my/prescriptions`
- `GET /consultations/:id`
- `POST /consultations/:id/messages`
- `POST /consultations/:id/reports`
- `GET /consultations/:id/reports/:fileId/view`
- `POST /consultations/:id/doctor/approve` (DOCTOR)
- `POST /consultations/:id/doctor/complete-delete` (DOCTOR)

### Payments (Mock)
- `POST /consultations/:id/payment/mock/create-order`
- `POST /consultations/:id/payment/mock/verify`

### AI + Prescription
- `POST /consultations/:id/ai/summary`
- `POST /consultations/:id/ai/suggestions`
- `POST /consultations/:id/ai/prescription`
- `POST /consultations/:id/doctor/prescription`

### Call Signaling
- `GET /consultations/:id/call/signals`
- `POST /consultations/:id/call/signal`

---

## Android App

### Sync web assets

```bash
npm run build:web
npx cap sync android
```

### Open Android Studio

```bash
npx cap open android
```

### Build release APK

```bash
cd android
JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" PATH="$JAVA_HOME/bin:$PATH" ./gradlew assembleRelease
```

APK output:

```text
android/app/build/outputs/apk/release/app-release.apk
```

---

## Deployment (Render)

### Build command

```bash
npm install && npm run build
```

### Start command

```bash
npm start
```

Set all required env vars in Render dashboard (especially `MONGODB_URI`, `JWT_SECRET`, and OpenAI key).

---

## Troubleshooting

### Port already in use

```bash
lsof -i :4000
kill -9 <PID>
```

### Mongo URI parse error in zsh (`&` issue)

Wrap URI in quotes:

```bash
mongosh "mongodb+srv://user:pass@cluster.mongodb.net/db?retryWrites=true&w=majority"
```

### Render build error: `esbuild: Exec format error`

Use Render build command `npm install && npm run build` and keep prebuilt `public/app.bundle.js` in repo.

### Android build says Java missing

Set `JAVA_HOME` to Android Studio JBR as shown in the APK build command.

---

## Security Notes

- Never commit `.env` or real credentials.
- Rotate DB/JWT/API secrets if exposed.
- Keep TLS, validation, rate limiting, and audit logging for production.

---

## License

UNLICENSED
