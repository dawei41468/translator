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
- **Engine Abstraction Framework**: Swappable STT/TTS/Translation engines (Grok by default; extensible for additional providers)
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
- **Translation**: Grok (xAI) by default via engine registry (extensible)
- **Speech-to-Text (STT)**: Grok STT (WebSocket streaming) via Socket.IO
- **Text-to-Speech (TTS)**: Grok TTS via server `/api/tts/synthesize` with caching
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
   - `GROK_API_KEY`: xAI Grok API key (required for STT / TTS / Translation)

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

**Current Progress**: MVP + Practice + Rooms Grok Voice S2S (see [`docs/ARCHITECTURE-CURRENT.md`](docs/ARCHITECTURE-CURRENT.md)).

See [`docs/ROADMAP.md`](docs/ROADMAP.md) for remaining post-MVP work.