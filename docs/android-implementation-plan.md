# Android Implementation Update Plan

**Status**: In Progress (MVP Phase)  
**Last Updated**: January 15, 2026  
**Target**: Full compliance with webapp frontend pillars guidelines

## Current Implementation Status

### ✅ Completed Components

1. **Three Core Pillars Implemented**
   - **STT**: AudioRecorder with VAD, PCM streaming at 48kHz
   - **MT**: WebSocket client with all translation events
   - **TTS**: ExoPlayer integration with voice selection

2. **Backend Integration**
   - Cookie-based authentication (PersistentCookieJar)
   - WebSocket with reconnection logic
   - All HTTP API endpoints (Retrofit)
   - Binary audio streaming

3. **UI/UX**
   - Material3 design system
   - Conversation screen with message bubbles
   - Room header with QR code generation
   - Settings dialog with language selection
   - Solo mode toggle
   - Push-to-talk with visual feedback

### ⚠️ Critical Gaps (High Priority)

1. **Sample Rate Inconsistency**
   - AudioRecorder: 48kHz
   - SpeechConfigData: 16kHz (default)
   - **Action**: Standardize to 48kHz throughout

2. **Network Resilience**
   - No buffering during network interruptions
   - **Action**: Add 10s audio buffer as per web spec

3. **Error Handling**
   - Generic error messages only
   - No structured error categories
   - **Action**: Implement web-style error categories

4. **Rate Limiting**
   - No client-side rate limiting
   - **Action**: Add rate limiting for audio streaming

### 📋 Medium Priority Improvements

5. **VAD Parameter Tuning**
   - Custom thresholds may not be optimal
   - **Action**: Add device-specific tuning

6. **Reconnection Logic**
   - Basic exponential backoff only
   - **Action**: Add recoverable error detection

7. **Engine Registry Pattern**
   - Hardcoded Google Cloud only
   - **Action**: Implement swappable engine registry

8. **Debug Infrastructure**
   - No debug panel UI
   - **Action**: Add comprehensive debug overlay

### 📊 Compliance Score: 85%

| Component | Score | Blockers |
|-----------|-------|----------|
| STT | 85% | Sample rate, buffering |
| MT | 90% | Rate limiting, error handling |
| TTS | 95% | Engine registry |
| Auth | 95% | None |
| UI/UX | 90% | None |

## Implementation Roadmap

### Phase 1: Critical Fixes (Week 1)

#### 1.1 Audio Configuration Standardization
**Files**: `AudioRecorder.kt`, `SpeechConfigData.kt`, `ConversationViewModel.kt`

```kotlin
// Standardize to 48kHz
// AudioRecorder.kt (already correct)
private val sampleRate = 48000

// SpeechConfigData.kt - Update default
val sampleRateHertz: Int = 48000

// ConversationViewModel.kt - Ensure 48kHz in config
put("sampleRateHertz", 48000)
```

**Verification**:
- [ ] Audio chunks are exactly 250ms at 48kHz
- [ ] Server receives correct sample rate
- [ ] No audio quality degradation

#### 1.2 Network Buffering Implementation
**Files**: `WebSocketClient.kt` (primary), `AudioRecorder.kt` (minor adjustments)

```kotlin
// In WebSocketClient.kt
private val networkBuffer = ArrayDeque<ByteArray>()
private var isConnected = false
private val maxBufferChunks = 400 // 400 chunks * 250ms = 100 seconds (10s target)

fun sendBinaryWithBuffer(data: ByteArray) {
    if (isConnected) {
        // Flush buffer first
        while (networkBuffer.isNotEmpty()) {
            socket?.emit("speech-data", networkBuffer.removeFirst())
        }
        // Send current data
        socket?.emit("speech-data", data)
    } else {
        // Buffer when disconnected, limit to ~10s
        networkBuffer.addLast(data)
        if (networkBuffer.size > 40) { // 40 chunks * 250ms = 10 seconds
            networkBuffer.removeFirst()
        }
    }
}

// Update connection state tracking
socket?.on(Socket.EVENT_CONNECT) {
    isConnected = true
    // Flush buffer on connect
    while (networkBuffer.isNotEmpty()) {
        socket?.emit("speech-data", networkBuffer.removeFirst())
    }
}

socket?.on(Socket.EVENT_DISCONNECT) {
    isConnected = false
}
```

**Verification**:
- [ ] Buffer holds up to 10s of audio
- [ ] Buffer flushes on reconnection
- [ ] No audio loss during network blips
- [ ] Old chunks removed when buffer exceeds 10s

#### 1.3 Structured Error Handling
**Files**: New `ErrorTypes.kt`, `ConversationViewModel.kt`, `WebSocketClient.kt`

```kotlin
// ErrorTypes.kt
enum class ErrorCategory {
    STT_STREAM_ERROR,
    TTS_FAILED,
    VAD_ERROR,
    RECORDING_START_FAILED,
    NETWORK_ERROR,
    AUTH_ERROR,
    RATE_LIMIT_ERROR
}

data class AppError(
    val category: ErrorCategory,
    val message: String,
    val recoverable: Boolean,
    val metadata: Map<String, Any>? = null
)
```

**Verification**:
- [ ] All errors categorized correctly
- [ ] Recoverable errors trigger retry logic
- [ ] User-friendly error messages displayed

### Phase 2: Production Hardening (Week 2)

#### 2.1 Rate Limiting Implementation
**Files**: `WebSocketClient.kt` (enhanced), `AudioRecorder.kt` (integration)

```kotlin
// Enhanced rate limiter for all WebSocket events
class WebSocketRateLimiter {
    // Different limits for different event types
    private val eventLimits = mapOf(
        "speech-data" to 4,      // 4 chunks/sec (250ms chunks)
        "start-speech" to 10,    // 10 starts/min
        "stop-speech" to 10,     // 10 stops/min
        "join-room" to 5,        // 5 joins/min
        "leave-room" to 5        // 5 leaves/min
    )
    
    private val eventTimestamps = mutableMapOf<String, MutableList<Long>>()
    
    fun canSend(event: String): Boolean {
        val limit = eventLimits[event] ?: return true
        val now = System.currentTimeMillis()
        val timestamps = eventTimestamps.getOrPut(event) { mutableListOf() }
        
        // Remove old timestamps (older than 1 minute)
        timestamps.removeAll { now - it > 60_000 }
        
        return timestamps.size < limit
    }
    
    fun recordSend(event: String) {
        eventTimestamps.getOrPut(event) { mutableListOf() }.add(System.currentTimeMillis())
    }
}

// Integration in WebSocketClient
private val rateLimiter = WebSocketRateLimiter()

fun sendEvent(event: String, data: Any? = null) {
    if (!rateLimiter.canSend(event)) {
        Log.w("WebSocket", "Rate limit hit for event: $event")
        return
    }
    rateLimiter.recordSend(event)
    // ... existing send logic
}

fun sendBinary(data: ByteArray) {
    if (!rateLimiter.canSend("speech-data")) {
        Log.w("WebSocket", "Rate limit hit for speech-data")
        return
    }
    rateLimiter.recordSend("speech-data")
    // ... existing send logic
}
```

**Verification**:
- [ ] No more than 4 chunks/second sent
- [ ] Rate limit errors handled gracefully
- [ ] Server rate limits not exceeded
- [ ] All WebSocket events rate limited appropriately

#### 2.2 Enhanced Reconnection Logic
**Files**: `WebSocketClient.kt`

```kotlin
// Add recoverable error detection
private val recoverableErrors = listOf(
    "incomplete envelope",
    "connection reset by peer",
    "maximum allowed stream duration"
)

fun isRecoverableError(error: String): Boolean {
    return recoverableErrors.any { error.contains(it, ignoreCase = true) }
}

// Implement retry windows
private var sttRestartWindowStartedAt: Long = 0
private var sttRestartCount = 0
private val maxRestartsPerWindow = 3
private val windowDurationMs = 30_000L

fun canRestartStt(): Boolean {
    val now = System.currentTimeMillis()
    if (now - sttRestartWindowStartedAt > windowDurationMs) {
        sttRestartWindowStartedAt = now
        sttRestartCount = 0
    }
    return sttRestartCount < maxRestartsPerWindow
}
```

**Verification**:
- [ ] Recoverable errors trigger reconnection
- [ ] Max 3 restarts per 30s window
- [ ] Non-recoverable errors don't retry

#### 2.3 VAD Parameter Tuning
**Files**: `AudioRecorder.kt`

```kotlin
// Make VAD parameters configurable
class VadConfig(
    val threshold: Float = 0.005f,
    val startFrames: Int = 3,
    val stopFrames: Int = 10,
    val maxSilenceMs: Long = 5000
)

// Add device-specific presets
val VAD_PRESETS = mapOf(
    "high_noise" to VadConfig(threshold = 0.008f, startFrames = 5),
    "quiet" to VadConfig(threshold = 0.003f, startFrames = 2),
    "default" to VadConfig()
)
```

**Verification**:
- [ ] VAD works in noisy environments
- [ ] VAD doesn't clip quiet speech
- [ ] Configurable via settings

### Phase 3: Architecture Improvements (Week 3)

#### 3.1 Engine Registry Pattern
**Files**: New `SpeechEngineRegistry.kt`, `TTSEngine.kt`, `STTEngine.kt`

```kotlin
// Engine interfaces
interface STTEngine {
    fun startRecording(config: SpeechConfigData)
    fun stopRecording()
    fun isAvailable(): Boolean
    fun getName(): String
}

interface TTSEngine {
    suspend fun synthesize(text: String, language: String): ByteArray?
    fun isAvailable(): Boolean
    fun getName(): String
}

// Registry
class SpeechEngineRegistry {
    private val sttEngines = mutableMapOf<String, STTEngine>()
    private val ttsEngines = mutableMapOf<String, TTSEngine>()
    
    fun registerSTTEngine(id: String, engine: STTEngine) {
        sttEngines[id] = engine
    }
    
    fun registerTTSEngine(id: String, engine: TTSEngine) {
        ttsEngines[id] = engine
    }
    
    fun getSTTEngine(id: String? = null): STTEngine? {
        return if (id != null) sttEngines[id] else sttEngines["google-cloud"]
    }
    
    fun getTTSEngine(id: String? = null): TTSEngine? {
        return if (id != null) ttsEngines[id] else ttsEngines["google-cloud"]
    }
}
```

**Verification**:
- [ ] Engines can be swapped via configuration
- [ ] Fallback to default engine if preferred unavailable
- [ ] User preferences respected

### Phase 4: Testing & Polish (Week 4)

#### 4.1 Comprehensive Testing

**Unit Tests**:
- [ ] AudioRecorder VAD logic (RMS calculation, threshold detection)
- [ ] WebSocketClient reconnection (exponential backoff, max attempts)
- [ ] TTSPlayer queue management (sequential playback, error handling)
- [ ] Rate limiter behavior (event tracking, window management)
- [ ] Error categorization (recoverable vs non-recoverable)

**Integration Tests** (using MockWebServer):
- [ ] End-to-end conversation flow (join → speak → receive translation)
- [ ] Network interruption recovery (disconnect → buffer → reconnect → flush)
- [ ] Authentication persistence (login → cookie storage → auto-login on restart)
- [ ] Multi-user room translation (2+ users, different languages)
- [ ] Rate limiting enforcement (attempt to exceed limits, verify blocking)
- [ ] Error recovery scenarios (recoverable errors trigger retry, non-recoverable don't)

**UI Tests** (using Compose Test):
- [ ] Conversation screen interactions (mic button, language selection)
- [ ] Settings dialog (solo mode toggle, language change)
- [ ] Error state displays (connection errors, permission errors)
- [ ] Navigation flows (auth → dashboard → conversation → back)

**Performance Tests**:
- [ ] Memory usage during active conversation (<100MB)
- [ ] Battery drain during active conversation (<5%/hour)
- [ ] Latency measurements (STT <1500ms, MT <800ms, TTS <1000ms)

#### 4.2 Performance Optimization

**Memory Management**:
- [ ] Profile audio buffer usage
- [ ] Ensure proper cleanup on destroy
- [ ] Optimize bitmap loading for QR codes

**Battery Optimization**:
- [ ] Monitor wake lock usage
- [ ] Optimize VAD processing
- [ ] Efficient network polling

**Network Optimization**:
- [ ] Compress audio where possible
- [ ] Batch API requests
- [ ] Optimize WebSocket message size

## Updated Documentation Structure

The `docs/native-android-translator.md` should be updated to include:

1. **Current Implementation Status** (new section)
   - What's implemented
   - What's pending
   - Known issues

2. **Architecture Decisions** (new section)
   - Why custom VAD instead of library
   - Engine registry pattern (when implemented)
   - State management approach
   - Network buffering strategy

3. **Testing Strategy** (expanded)
   - Unit test coverage targets (>80%)
   - Integration test scenarios (MockWebServer)
   - UI test coverage (Compose)
   - Device testing matrix (5-10 devices)
   - Performance test benchmarks

4. **Performance Benchmarks** (new section)
   - Target latencies: STT <1500ms, MT <800ms, TTS <1000ms
   - Memory usage: <100MB during active conversation
   - Battery consumption: <5% per hour
   - Rate limiting: 4 chunks/sec, 10 starts/min

5. **Deployment Notes** (new section)
   - Build configuration (min SDK 26, target SDK 35)
   - Proguard rules for release builds
   - Release checklist (tests, performance, signing)
   - Play Store requirements

## Success Criteria

### MVP Ready (End of Week 2)
- [ ] Sample rate standardized to 48kHz
- [ ] Network buffering implemented (10s capacity)
- [ ] Structured error handling in place
- [ ] Rate limiting active (all WebSocket events)
- [ ] Enhanced reconnection logic working (recoverable errors, retry windows)
- [ ] All critical gaps resolved
- [ ] Basic unit tests passing

### Production Ready (End of Week 4)
- [ ] All medium priority improvements complete (VAD tuning, engine registry)
- [ ] Comprehensive test coverage (>80% unit, integration, UI)
- [ ] Performance optimized (memory, battery, network)
- [ ] All tests passing (unit, integration, UI, performance)
- [ ] Documentation updated and reviewed
- [ ] User testing completed on 5-10 devices
- [ ] Release checklist completed

## Risk Mitigation

### High Risks
1. **Sample rate mismatch causing audio issues**
   - Mitigation: Thorough testing with real devices, server log analysis

2. **Network buffering adding latency**
   - Mitigation: Measure end-to-end latency, optimize buffer size

3. **Rate limiting affecting user experience**
   - Mitigation: Gradual rollout, monitor user feedback

### Medium Risks
4. **VAD performance varies by device**
   - Mitigation: Device-specific presets, user-adjustable settings

5. **Reconnection logic not handling all cases**
   - Mitigation: Extensive network condition testing

## Resources Required

### Development
- **Time**: 4 weeks (160 hours)
- **Focus**: Full-time on Android implementation

### Testing
- **Devices**: 5-10 physical Android devices (various manufacturers)
- **Network**: Test with poor connectivity, VPN, firewall scenarios

### Documentation
- **Time**: 20 hours for comprehensive documentation updates
- **Content**: Architecture decisions, API docs, user guides

## Conclusion

This plan addresses all critical gaps identified in the analysis while maintaining the solid foundation already built. The phased approach ensures we can deliver an MVP quickly while progressively improving quality and compliance.

**Next Step**: Begin Phase 1 with sample rate standardization and network buffering implementation.