# Live Translator

A Progressive Web App (PWA) for real-time cross-device conversation translation. Enable seamless two-way translated conversations between users on different devices (iOS/Android) using natural speech.

## 🌟 Features

- **Real-Time Translation**: Instant speech-to-text, translation, and text-to-speech across devices
- **Private Rooms**: QR codes + short room codes for secure conversations
- **Multi-Language Support**: Chinese (Mandarin), English, Italian, German, Dutch
- **Bluetooth Headset Integration**: Audio input/output routing to headsets
- **PWA Ready**: Installable on mobile devices, works offline-ready
- **User Authentication**: Secure login with JWT cookies

## 🚀 Live Demo

[https://translator.studiodtw.net](https://translator.studiodtw.net)

## 🛠 Tech Stack

- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui + TanStack Query + React Router
- **Backend**: Node.js 20 + Express + Drizzle ORM + PostgreSQL
- **Real-Time**: Socket.io (authenticated)
- **Translation**: Google Cloud Translation API (asia-east2)
- **TTS**: Browser Web Speech API (SpeechSynthesis)
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
   - `GOOGLE_CLOUD_PROJECT_ID`: Google Cloud project ID (required for server-side translation)

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

- Server runs on port 4003
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
├── project-translator.md # Product roadmap & specs
├── CODEBASE-PATTERNS.md  # Development patterns
└── README.md           # This file
```

## 🤝 Contributing

1. Follow the patterns in `CODEBASE-PATTERNS.md`
2. Use OneProject conventions exactly
3. Test on real iOS/Android devices
4. Update `project-translator.md` for any changes

## 📄 License

[Add license information]

## 📞 Contact

[Add contact information]

---

**Current Progress**: 90% (Core features completed - QR joining, multi-user translation, end-to-end speech/TTS — MVP target: End of January 2026)

See [`project-translator.md`](project-translator.md) for detailed roadmap and status.