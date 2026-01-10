# Live Translator

A Progressive Web App (PWA) for real-time cross-device conversation translation. Enable seamless two-way translated conversations between users on different devices (iOS/Android) using natural speech.

## 🌟 Features

- **Real-Time Translation**: Instant speech-to-text, translation, and text-to-speech across devices
- **Private Rooms**: QR codes + short room codes for secure conversations
- **Multi-Language Support**: English, Chinese (Mandarin), Italian, German, Dutch (plus Korean, Spanish, Japanese)
- **Bluetooth Headset Integration**: Audio input/output routing to headsets
- **PWA Ready**: Installable on mobile devices, works offline-ready
- **User Authentication**: Secure login with JWT cookies
- **Guest Mode**: Join/create with only a display name (creates a temporary guest account)
- **Engine Abstraction Framework**: Swappable STT/TTS/Translation engines (currently: Google Cloud STT + Google Cloud TTS + Google Translate / Grok Translate)
- **Profile Management**: User preferences, display names, language settings
- **Accessibility Compliant**: WCAG 2.1 AA with screen reader support
- **Cross-Device Sync**: Preferences follow users across browsers/devices
- **Dashboard UX**: Mobile FAB quick actions + recent room history

## 🚀 Live Demo

[https://translator.studiodtw.net](https://translator.studiodtw.net)

## 🛠 Tech Stack

- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui + TanStack Query + React Router
- **Backend**: Node.js 20 + Express + Drizzle ORM + PostgreSQL
- **Real-Time**: Socket.io (authenticated)
- **Translation**: Engine registry (Google Cloud Translation v3 + optional Grok)
- **Speech-to-Text (STT)**: Google Cloud Speech streaming via Socket.IO (`start-speech` + `speech-data`)
- **Text-to-Speech (TTS)**: Server-side Google Cloud Text-to-Speech via `/api/tts/synthesize` with filesystem caching
- **Deployment**: PM2 + NGINX + Tencent Lighthouse HK
- **Monorepo**: Turborepo + pnpm

## 📦 Installation

### Prerequisites

- Node.js 20+
- pnpm
- PostgreSQL database

### Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd translator
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   ```

3. **Environment Setup**
   ```bash
   cp .env.example .env
   ```
   Configure your environment variables:
   - `DATABASE_URL`: PostgreSQL connection string
   - `JWT_SECRET`: Secure JWT secret
   - `PORT`: Server port (dev/prod typically `4003`)
   - `GOOGLE_CLOUD_PROJECT_ID`: Google Cloud project ID (required for server-side translation)
   - `GOOGLE_APPLICATION_CREDENTIALS`: Path to Google service account JSON (relative paths are supported; resolved from repo root)
   - `GOOGLE_CLOUD_TRANSLATE_LOCATION` (optional): Google Translation location (`global` or `us-central1`)

4. **Database Setup**
   ```bash
   pnpm db:push
   ```

5. **Development**
   ```bash
   # Start both server and web
   pnpm dev

   # Or separately
   pnpm -C apps/server dev
   pnpm -C apps/web dev
   ```

   Notes:
   - The Vite dev server runs on port `4004` and proxies `/api/*` to `http://localhost:4003`.
   - The Socket.IO client uses `VITE_API_BASE_URL` (if set) to derive the socket base URL.

6. **Build for Production**
   ```bash
   pnpm build
   ```

## 🚀 Deployment

### Production Server

The app is configured for PM2 deployment on Tencent Lighthouse HK:

```bash
# Deploy script
./deploy.sh
```

- Server runs on `PORT` (production default is `4003`)
- NGINX proxies from 443 to 127.0.0.1:4003
- PM2 manages the process with `ecosystem.config.cjs`

## 📱 Usage

1. **Register/Login**: Create an account or sign in
2. **Create Room**: Start a new conversation room
3. **Invite**: Show the QR code or share the room code with the other user
4. **Join & Speak**: Both users join, select languages, and speak naturally
5. **Real-Time Translation**: Hear translations instantly through speakers or Bluetooth headsets

## 🏗 Project Structure

```
translator/
├── apps/
│   ├── server/          # Express API server
│   └── web/             # React frontend
├── packages/
│   └── db/              # Drizzle database schema
├── docs/
│   ├── project-translator.md # Product roadmap & specs
│   ├── CODEBASE-PATTERNS.md  # Development patterns
│   └── ROADMAP.md            # Post-MVP roadmap
└── README.md           # This file
```

## 🤝 Contributing

1. Follow the patterns in `docs/CODEBASE-PATTERNS.md`
2. Use OneProject conventions exactly
3. Test on real iOS/Android devices
4. Update `docs/project-translator.md` for any changes

## 📄 License

[Add license information]

## 📞 Contact

[Add contact information]

---

**Current Progress**: 100% MVP COMPLETE (Auth/infra/deploy/db/backend-core/frontend-core complete — January 6, 2026)

See [`docs/project-translator.md`](docs/project-translator.md) for detailed roadmap and status.