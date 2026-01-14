# Native Android Translator App Specification

This document provides a complete specification for building a native Android app (Kotlin + Jetpack Compose) that integrates seamlessly with the existing translator backend at `/Users/dawei/Coding/Projects/translator/apps/server`.

The app mirrors the web app's functionality: authentication, profile management, room creation/joining, real-time conversation with STT/translation via WebSocket, and TTS playback.

## Status Overview (Jan 14, 2026)
- **Backend + Web**: Fully implemented inside this repo (Node/Express server under `apps/server` backed by Drizzle ORM + PostgreSQL in `packages/db`, React/Tailwind web client under `apps/web`). These services expose the HTTP + WebSocket interfaces described below and are the source of truth for the Android client.
- **Native Android client**: No Kotlin code has been committed to the repo yet; this spec remains the blueprint for the upcoming implementation. Work so far has focused on validating the backend contract and prototyping the Android networking/audio layers off-repo.
- **Testing focus**: Currently validating the **three core pillars** on device:
  1. Cookie-based auth + session persistence (OkHttp `CookieJar` + `/api/me` verification).
  2. Streaming STT + translation over the `/socket` WebSocket (AudioRecord -> LINEAR16 chunks -> `speech-data`).
  3. TTS playback via `/api/tts/synthesize` → Media3 `ExoPlayer`.

### Current Findings
- Emulator access works via the standard `10.0.2.2` loopback alias, but **physical Android devices cannot reach the dev server when this alias is hardcoded**. Update the client config to use the laptop’s LAN IP (e.g., `http://192.168.x.x:4003`) or run `adb reverse tcp:4003 tcp:4003` while plugged in.
- Next round of tests will run from a real Android device on the same network as the dev machine to finish validating the three pillars above.

### Next Actions
1. Expose the dev server on `0.0.0.0` and confirm the laptop’s LAN IP so physical devices can connect without relying on `10.0.2.2`.
2. Add the native Android module (Gradle setup, Hilt, Retrofit, WebSocket + Audio layers) to this repo following the spec below.
3. Implement Compose UI screens (Auth → Dashboard → Conversation) and wire them to the backend endpoints.
4. Instrument regression tests once the client scaffolding lands (unit tests for repositories/ViewModels + MockWebServer integration tests).

## Backend API Base URL
```
Dev: http://localhost:4003/api
Prod: https://translator.studiodtw.net/api
```
WS Dev: ws://localhost:4003/socket
WS Prod: wss://translator.studiodtw.net/socket

All endpoints prefixed `/api`.

## Authentication Mechanism
- Server uses **cookie-only** `auth_token` (JWT, expires 30d). NO Bearer token support.
- Login/Register/Guest: POST sets `Set-Cookie: auth_token=...`.
- **OkHttp CookieJar**: PersistentCookieJar with EncryptedSharedPreferences (SHA256_HMAC + AES256_GCM).
- WS: Include `Cookie: auth_token=...` in handshake headers.
- Validate: GET /api/me returns {user} or {user: null}.

## Data Models (Kotlin Data Classes)
```kotlin
data class AuthUser(
    val id: String,
    val name: String,
    val email: String,
    val displayName: String?,
    val language: String,
    val isGuest: Boolean? = false,
    val preferences: UserPreferences? = null
)

data class UserPreferences(
    val sttEngine: String?,
    val ttsEngine: String?,
    val translationEngine: String?
)

data class RoomInfo(
    val id: String,
    val code: String,
    val participants: List<Participant>
)

data class Participant(
    val id: String,
    val name: String,
    val language: String
)

data class TranslatedMessage(
    val originalText: String,
    val translatedText: String,
    val sourceLang: String,
    val targetLang: String,
    val fromUserId: String,
    val toUserId: String,
    val speakerName: String
)

data class SpeechConfig(
    val languageCode: String,  // BCP47 e.g., "en-US"
    val soloMode: Boolean = false,
    val soloTargetLang: String? = null,
    val encoding: String = "LINEAR16",  // LINEAR16 preferred, or WEBM_OPUS
    val sampleRateHertz: Int = 48000   // Matches server default
)
```

## Supported Languages
Hardcode array matching web:

```kotlin
data class LanguageOption(val code: String, val flag: String, val nativeName: String)

val LANGUAGES = listOf(
    LanguageOption("en", "🇺🇸", "English"),
    LanguageOption("zh", "🇨🇳", "中文"),
    LanguageOption("ko", "🇰🇷", "한국어"),
    LanguageOption("es", "🇪🇸", "Español"),
    LanguageOption("ja", "🇯🇵", "日本語"),
    LanguageOption("it", "🇮🇹", "Italiano"),
    LanguageOption("de", "🇩🇪", "Deutsch"),
    LanguageOption("nl", "🇳🇱", "Nederlands")
)
```
Use BCP47 e.g. "en-US", "zh-CN" for STT/TTS.

## Dependencies (build.gradle.kts :app)
```kotlin
implementation("androidx.core:core-ktx:1.13.1")
implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.4")
implementation("androidx.activity:activity-compose:1.9.1")
implementation(platform("androidx.compose:compose-bom:2024.09.03"))
implementation("androidx.compose.ui:ui")
implementation("androidx.compose.ui:ui-graphics")
implementation("androidx.compose.ui:ui-tooling-preview")
implementation("androidx.compose.material3:material3")
implementation("androidx.navigation:navigation-compose:2.8.0")

// Networking
implementation("com.squareup.retrofit2:retrofit:2.11.0")
implementation("com.squareup.retrofit2:converter-gson:2.11.0")
implementation("com.squareup.okhttp3:okhttp:4.12.0")
implementation("com.squareup.okhttp3:logging-interceptor:4.12.0")

// WS
implementation("com.squareup.okhttp3:okhttp-ws:4.12.0")  // Or Socket.IO if preferred

// Audio
implementation("androidx.media3:media3-exoplayer:1.3.1")
implementation("androidx.media3:media3-common:1.3.1")

// Permissions
implementation("com.google.accompanist:accompanist-permissions:0.32.0")

// Secure storage
implementation("androidx.security:security-crypto:1.1.0-alpha06")

// DI
implementation("androidx.hilt:hilt-navigation-compose:1.2.0")
kapt("androidx.hilt:hilt-compiler:1.2.0")
```
Min SDK 26, target 35.

## App Architecture
- **MVVM with Hilt DI**, Repository pattern.
- **Navigation**: Jetpack Navigation Compose (screens: Splash, Login, Register, Dashboard, Profile, Conversation).
- **State**: ViewModel with StateFlow, handle loading/error.
- **HTTP Client**: Retrofit + OkHttp (with CookieJar).
- **WS Client**: OkHttp WebSocket, reconnect logic.
- **Audio Record**: AudioRecord for LINEAR16 16kHz mono, chunk to WS.
- **TTS**: Media3 ExoPlayer for MP3 playback.
- **Storage**: DataStore<Preferences> for recent rooms (JSON array), EncryptedSharedPreferences for cookies.
- **Permissions**: Mic, Internet (runtime).

```
MainActivity
├── SplashScreen (check auth)
├── AuthFlow
│   ├── LoginScreen
│   ├── RegisterScreen
│   └── GuestLogin (displayName)
├── DashboardScreen (recent rooms from DataStore, create/join/share buttons)
├── ProfileScreen (update displayName/language/preferences)
└── ConversationScreen (roomCode param)
    ├── RoomHeader (code, participants list)
    ├── MessageList (bubbles: text/original/translated)
    ├── Controls (mic button, lang selector, solo toggle)
    └── DebugPanel (optional: status, logs)
```

## HTTP API Endpoints (Retrofit Interfaces)
```kotlin
interface TranslatorApi {
  @POST("auth/login")
  suspend fun login(@Body req: LoginRequest): Response<AuthResponse>

  @POST("auth/register")
  suspend fun register(@Body req: RegisterRequest): Response<AuthResponse>

  @POST("auth/guest-login")
  suspend fun guestLogin(@Body req: GuestRequest): Response<AuthResponse>

  @POST("auth/logout")
  suspend fun logout(): Response<Unit>

  @GET("me")
  suspend fun getMe(): Response<MeResponse>

  @PATCH("me")
  suspend fun updateMe(@Body req: UpdateMeRequest): Response<Unit>

  @POST("rooms")
  suspend fun createRoom(): Response<RoomResponse>

  @POST("rooms/join/{code}")
  suspend fun joinRoom(@Path("code") code: String): Response<RoomResponse>

  @GET("rooms/{code}")
  suspend fun getRoom(@Path("code") code: String): Response<RoomInfo>

  @POST("tts/synthesize")
  suspend fun synthesize(@Body req: TtsRequest): Response<ResponseBody>  // MP3 bytes
}
```
**Exact Schemas** (Gson/Retrofit):

```kotlin
data class LoginRequest(val email: String, val password: String)
data class AuthResponse(val user: AuthUser)

data class RegisterRequest(val email: String, val password: String, val name: String)

data class GuestRequest(val displayName: String)

data class UpdateMeRequest(
    val displayName: String? = null,
    val language: String? = null,
    val preferences: UserPreferences? = null
)

data class RoomResponse(val roomId: String, val roomCode: String, val alreadyJoined: Boolean? = null)

data class TtsRequest(
    val text: String,
    val languageCode: String,
    val voiceName: String? = null,  // e.g., "en-US-Wavenet-D"
    val ssmlGender: String? = null  // "MALE", "FEMALE", "NEUTRAL"
)
```
All validated server-side.

## WebSocket Protocol (/socket)
- Connect with Cookie header including `auth_token`.
- Events (JSON unless noted):
  | Client -> Server | Server -> Client | Description |
  |------------------|------------------|-------------|
  | `join-room` `{roomCode}` | `joined-room` `{roomId}` | Join room |
  | | `user-joined`/`user-left` `{userId}` | Participant change |
  | `start-speech` `SpeechConfig` | | Start STT |
  | `speech-data` `Buffer` (binary) | | Audio chunk (100KB max) |
  | `stop-speech` | | Stop STT |
  | `speech-transcript` `{transcript, sourceLang}` | | Fallback manual transcript |
  | | `recognized-speech` `{id, text, sourceLang, speakerName}` | Own recognition |
  | | `translated-message` `TranslatedMessage` | Received translation |
  | | `solo-translated` `TranslatedMessage` | Solo mode self-translation |
  | | `speech-error` `string` | STT error |
  | | `error` `{message, errorId}` | General error |
  | | `ping` | Heartbeat | `pong`

- Reconnect: Exponential backoff, re-join room.
- Binary: Raw PCM bytes for LINEAR16 (signed 16bit little-endian, mono, 48kHz), chunks <=100KB.
- Server: Google Speech-to-Text streaming, interimResults=true, auto-punctuation.

## Key Implementation Flows
1. **Auth**: Login -> Cookie stored -> Navigate Dashboard.
2. **Dashboard**: List recent rooms (local JSON), buttons: Create Room (POST rooms -> copy code), Join (input code -> nav Conversation).
3. **Conversation**:
   - Join via WS.
   - Poll GET /rooms/{code} for participants.
   - Mic: Permission -> AudioRecord -> chunk every 100ms -> WS speech-data.
   - On `translated-message`: Show bubble, synthesize TTS if target lang matches user lang.
   - Solo: Toggle, set soloTargetLang.
4. **TTS**: POST synthesize -> play MP3 with ExoPlayer.
5. **Recent Rooms**: Mimic web localStorage:
   - List max 5 {code: String, lastUsedAt: Long}
   - On join/create: Add/update sorted by lastUsedAt, trim to 5.
   - DataStore proto or JSON Preferences.

## UI Guidelines
- Material3 Design, dark/light theme.
- Components: LanguageSelectorGrid (grid langs), MessageBubble (original/translated), BottomNav.
- Mic button: Pulsing animation while recording.
- Error handling: Snackbar.

## Testing
- Unit: Repos, ViewModels.
- Integration: MockWebServer for API/WS.
- E2E: Compose UI tests.

Build MVP following this spec exactly to match backend.