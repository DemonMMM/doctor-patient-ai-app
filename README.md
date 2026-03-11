# MediFlow: Doctor-Patient Consultation Platform

Full-stack healthcare consultation app with:
- Node.js + Express + TypeScript backend
- MongoDB (Mongoose) data layer
- React web client (bundled to static assets)
- Capacitor Android app wrapper
- Role-based workflows for `ADMIN`, `DOCTOR`, and `PATIENT`

## Current Capabilities
- JWT auth (`register`, `login`, `me`)
- Doctor approval flow by admin
- Admin-set doctor consultation fee
- Consultation lifecycle:
  - Patient books consultation
  - Doctor approves
  - Patient mock payment
  - Chat + report upload + video call
  - AI summary/suggestions/prescription
  - Doctor can save manual prescription
- Prescriptions listing for patient/doctor
- File upload stored online in MongoDB GridFS (not local disk for reports)
- In-app call signaling + native call notifications (Android plugin)

## Tech Stack
- Backend: `express`, `typescript`, `mongoose`, `jsonwebtoken`, `multer`
- Frontend: `react`, `react-dom`, static bundle via `esbuild`
- Mobile: `@capacitor/android`, `@capacitor/local-notifications`
- AI: OpenAI API (configurable model)

## Project Structure
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
    files/              # GridFS report storage
public/
  index.html
  app.jsx               # Main React app
  call-engine.js
  call-pane.jsx
  styles.css
android/                # Capacitor Android project
```

## Prerequisites
- Node.js 20+ (22 works)
- npm
- MongoDB Atlas or local MongoDB
- Android Studio (for APK builds)
- Java (Android Studio bundled JBR is enough)

## Environment Variables
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

# Local storage (legacy; reports now use GridFS)
UPLOAD_DIR=uploads

# Mock Razorpay
RAZORPAY_KEY_ID=rzp_test_mock
RAZORPAY_KEY_SECRET=mock_secret
```

Important:
- Never commit real secrets.
- `.env` is gitignored.

## Local Development

1) Install dependencies
```bash
npm install
```

2) Run backend (dev)
```bash
npm run dev
```

3) Build frontend bundle
```bash
npm run build:web
```

4) Open app
- Web: `http://localhost:4000`
- API health: `http://localhost:4000/api/health`

## Production Build (Server)
```bash
npm run build
npm start
```

## Android App (Capacitor)

### Sync web assets to Android
```bash
npm run build:web
npx cap sync android
```

### Open in Android Studio
```bash
npx cap open android
```

### Build signed release APK (CLI)
```bash
cd android
JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" PATH="$JAVA_HOME/bin:$PATH" ./gradlew assembleRelease
```

Release APK path:
```text
android/app/build/outputs/apk/release/app-release.apk
```

## Deployment (Render)
- Recommended build command:
```bash
npm install && npm run build
```
- Start command:
```bash
npm start
```
- Set all required environment variables in Render dashboard.

## API Overview (High-Level)
Base path: `/api`

- Auth:
  - `POST /auth/register`
  - `POST /auth/login`
- Users/Admin:
  - `GET /users/me`
  - `GET /users/doctors`
  - `GET /users/pending-doctors` (ADMIN)
  - `PATCH /users/approve-doctor/:doctorId` (ADMIN)
  - `PATCH /users/admin/doctors/:doctorId/consultation-fee` (ADMIN)
- Consultations:
  - `POST /consultations` (PATIENT)
  - `GET /consultations/my`
  - `GET /consultations/:id`
  - `POST /consultations/:id/messages`
  - `POST /consultations/:id/reports`
  - `GET /consultations/:id/reports/:fileId/view`
  - `POST /consultations/:id/doctor/approve`
  - `POST /consultations/:id/doctor/complete-delete`
- Payments (mock):
  - `POST /consultations/:id/payment/mock/create-order`
  - `POST /consultations/:id/payment/mock/verify`
- AI:
  - `POST /consultations/:id/ai/summary`
  - `POST /consultations/:id/ai/suggestions`
  - `POST /consultations/:id/ai/prescription`
  - `POST /consultations/:id/doctor/prescription` (manual)
- Call signaling:
  - `GET /consultations/:id/call/signals`
  - `POST /consultations/:id/call/signal`

## Common Troubleshooting

- `Port 4000 already in use`
```bash
lsof -i :4000
kill -9 <PID>
```

- `zsh: parse error near '&'` with Mongo URI  
Wrap the URI in quotes:
```bash
mongosh "mongodb+srv://user:pass@cluster.mongodb.net/db?retryWrites=true&w=majority"
```

- Render `esbuild: Exec format error`  
Do not run `build:web` on Render; commit prebuilt `public/app.bundle.js` and use `npm run build`.

- Android build says Java missing  
Set `JAVA_HOME` to Android Studio JBR (see build command above).

## Security Notes
- Hash passwords with bcrypt (already implemented for normal auth flows).
- Rotate JWT secret and DB credentials before production.
- Add rate limiting, audit logs, refresh token strategy, and stricter validation for production use.

## License
UNLICENSED (private/internal use unless changed by owner).
