# Native iOS Translator App Specification

This document provides a complete specification for building a native iOS app (Swift + SwiftUI) that integrates seamlessly with the existing translator backend at `/Users/dawei/Coding/Projects/translator/apps/server`.

The app mirrors the web app's functionality: authentication, profile management, room creation/joining, real-time conversation with STT/translation via WebSocket, and TTS playback.

## Backend API Base URL
```
Dev: http://localhost:4003/api
Prod: https://translator.studiodtw.net/api
```
WS Dev: ws://localhost:4003/socket
WS Prod: wss://translator.studiodtw.net/socket

All endpoints prefixed `/api`.

## Authentication Mechanism
- Server uses **cookie-only** `auth_token` (JWT, expires 30d). NO Bearer support.
- Login/Register/Guest: POST sets `Set-Cookie`.
- `HTTPCookieStorage.shared` handles persistence automatically.
- WS: Cookies included in handshake.
- Validate: GET /api/me -> {user} or {user: null}.

## Data Models (Swift Codable Structs)
```swift
struct AuthUser: Codable {
    let id: String
    let name: String
    let email: String
    let displayName: String?
    let language: String
    let isGuest: Bool?
    let preferences: UserPreferences?
}

struct UserPreferences: Codable {
    let sttEngine: String?
    let ttsEngine: String?
    let translationEngine: String?
}

struct RoomInfo: Codable {
    let id: String
    let code: String
    let participants: [Participant]
}

struct Participant: Codable {
    let id: String
    let name: String
    let language: String
}

struct TranslatedMessage: Codable {
    let originalText: String
    let translatedText: String
    let sourceLang: String
    let targetLang: String
    let fromUserId: String
    let toUserId: String
    let speakerName: String
}

struct SpeechConfig {
    let languageCode: String  // BCP47 e.g., "en-US"
    var soloMode: Bool = false
    var soloTargetLang: String?
    let encoding: String = "LINEAR16"
    let sampleRateHertz: Int = 48000  // Server default
}
```

## Supported Languages
Hardcode matching web:

```swift
struct LanguageOption: Identifiable {
    let id = UUID()
    let code: String
    let flag: String
    let nativeName: String
}

let LANGUAGES: [LanguageOption] = [
    LanguageOption(code: "en", flag: "🇺🇸", nativeName: "English"),
    LanguageOption(code: "zh", flag: "🇨🇳", nativeName: "中文"),
    LanguageOption(code: "ko", flag: "🇰🇷", nativeName: "한국어"),
    LanguageOption(code: "es", flag: "🇪🇸", nativeName: "Español"),
    LanguageOption(code: "ja", flag: "🇯🇵", nativeName: "日本語"),
    LanguageOption(code: "it", flag: "🇮🇹", nativeName: "Italiano"),
    LanguageOption(code: "de", flag: "🇩🇪", nativeName: "Deutsch"),
    LanguageOption(code: "nl", flag: "🇳🇱", nativeName: "Nederlands")
]
```
BCP47 e.g. "en-US" for STT/TTS.

## Dependencies (Swift Package Manager)
```
- Alamofire (optional for nicer HTTP)
- No others needed (native URLSession, AVFoundation)
```
iOS 17+, Swift 5.10+.

## App Architecture
- **MVVM with @Observable/@StateObject**, Repository pattern.
- **Navigation**: NavigationStack (views: SplashView, LoginView, RegisterView, DashboardView, ProfileView, ConversationView).
- **State**: @Published properties, async/await.
- **HTTP Client**: URLSession (shared with cookie storage).
- **WS Client**: URLSessionWebSocketTask, Task for reconnect.
- **Audio Record**: AVAudioEngine + AVAudioInputNode (linear PCM 16kHz 16bit mono), chunk Data to WS.
- **Audio Play**: AVAudioPlayer for MP3.
- **Storage**: @AppStorage("recentRooms") for JSON array, Keychain optional.
- **Permissions**: Microphone (Info.plist NSMicrophoneUsageDescription).

```
TranslatorApp
├── ContentView (root nav)
├── SplashView (auth check)
├── AuthViews
│   ├── LoginView
│   ├── RegisterView
│   └── GuestLoginView
├── DashboardView (recent rooms @AppStorage, create/join)
├── ProfileView (edit profile)
└── ConversationView (roomCode)
    ├── RoomHeaderView
    ├── MessageListView
    ├── ControlsView (mic, lang picker, solo)
    └── DebugView (status)
```

## HTTP API Endpoints
Use async/await URLSession or Alamofire.

Example:
```swift
func login(email: String, password: String) async throws -> AuthUser {
    var request = URLRequest(url: apiURL.appendingPathComponent("auth/login"))
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.httpBody = try JSONEncoder().encode(["email": email, "password": password])
    
    let (data, _) = try await URLSession.shared.data(for: request)
    let response = try JSONDecoder().decode(AuthResponse.self, from: data).user
    return response
}
```
**Exact Schemas** (Codable):

```swift
struct LoginRequest: Codable { let email: String; let password: String }
struct AuthResponse: Codable { let user: AuthUser }

struct RegisterRequest: Codable { let email: String; let password: String; let name: String }
struct GuestRequest: Codable { let displayName: String }

struct UpdateMeRequest: Codable {
    let displayName: String?
    let language: String?
    let preferences: UserPreferences?
}

struct RoomResponse: Codable {
    let roomId: String
    let roomCode: String
    let alreadyJoined: Bool?
}

struct TtsRequest: Codable {
    let text: String
    let languageCode: String
    let voiceName: String?
    let ssmlGender: String?  // "MALE"|"FEMALE"|"NEUTRAL"
}
```

## WebSocket Protocol (wss://your-server.com/socket)
- Connect with cookies from storage.
- Events (JSON or Data):
  Same table as Android spec.
- Binary: Raw PCM Data (LINEAR16 signed 16bit LE mono 48kHz), <=100KB chunks.
- Server: Google STT streaming, interim=true, punctuation.
- Reconnect: Monitor `didClose`, exponential backoff, re-join.

## Key Implementation Flows
1. **Auth**: Login -> Cookies auto-stored -> Dashboard.
2. **Dashboard**: Recent rooms (@AppStorage), Create (POST), Join -> Conversation.
3. **Conversation**:
   - WS join-room.
   - Fetch participants periodically.
   - Mic: Request permission -> AVAudioEngine tap -> send Data chunks (100ms).
   - `translated-message`: Append to list, synthesize if matches lang.
   - Solo mode toggle.
4. **TTS**: POST synthesize -> Data -> AVAudioPlayer.
5. **Recent Rooms**: Mimic web:
   - Array max 5 {code: String, lastUsedAt: TimeInterval}
   - On join/create: Insert/update, sort descending lastUsedAt, trim.
   - @AppStorage raw JSON.

## UI Guidelines
- SwiftUI Material-like, supports dark mode.
- Components: Grid lang selector, message bubbles.
- Mic: Pulsing animation (Timer + opacity).
- Errors: Alert/Toast.

## Testing
- XCTest for ViewModels/repos.
- URLProtocol mock for API/WS.

Build MVP exactly per this spec.