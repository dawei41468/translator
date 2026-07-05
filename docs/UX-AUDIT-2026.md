# UX/UI Audit & Improvement Roadmap (2026)

This document outlines a comprehensive UX/UI audit of the Live Translator app, with a focus on optimizing for Mobile/PWA users. The goal is to elevate the app from a functional tool to a polished, professional product.

## 🔍 Executive Summary

The app handles real-time translation logic well, but the **User Journey** has friction points that hinder quick interactions. The **UI Hierarchy** in the conversation view is crowded, consuming valuable screen real estate with settings rather than the conversation itself. The recommendations below aim to reduce "time-to-conversation" and maximize immersion.

---

## 1. 🚀 Onboarding & Access (Reducing Friction)

**Current State:**
- Users are greeted with a "Login to Join" message or standard auth forms.
- Joining via QR code requires a full signup/login flow.

**Problem:**
Translation often needs to happen *immediately*. Forcing a multi-step signup process just to listen to a room is a high barrier to entry that hurts adoption.

**Recommendations:**

### ✅ Guest Mode (High Impact)
- **Action:** Allow users to join a room via QR Code or Room Code with *only* a "Display Name" (no email/password required).
- **Implementation:** Create a temporary session/token for these users.
- **Benefit:** Drastically lowers the barrier to entry for casual listeners or one-time participants.

**Status (Current Code):** ✅ Implemented
- Dashboard prompts for a display name when unauthenticated and then performs the pending action (create / scan / join).
- Backend creates a persisted `users` row with `isGuest=true` and authenticates via the same `auth_token` cookie.

### ✅ Biometric Auth for PWA
- **Action:** Implement WebAuthn (FaceID/TouchID) for returning users on supported devices.
- **Benefit:** Typing passwords on mobile while trying to start a conversation is cumbersome. Biometrics make reentry seamless.

**Status (Current Code):** ❌ Not implemented
- No WebAuthn / `navigator.credentials.*` usage found in `apps/web`.

---

## 2. 🏠 Dashboard (The "Home Base")

**Current State:**
- Two static cards ("Start New", "Join Existing") and a hidden scanner.
- Layout feels like a web form rather than a mobile app home screen.

**Recommendations:**

### ✅ Floating Action Button (FAB)
- **Action:** Replace the static cards with a large, primary **FAB (Floating Action Button)** (+) at the bottom right.
- **Behavior:** Tapping it expands to options like "Create Room" or "Scan QR".
- **Benefit:** Aligns with standard mobile patterns for "creating content" and frees up screen space.

**Status (Current Code):** ✅ Implemented
- Mobile-only FAB with quick actions: Create room / Scan QR / Enter code.

### ✅ Recent History
- **Action:** Add a "Recent Conversations" list on the dashboard.
- **Benefit:** Users often rejoin the same room (e.g., a recurring meeting). Re-scanning or re-typing codes is repetitive friction.

**Status (Current Code):** ✅ Implemented
- Recent rooms are stored client-side and shown as quick-join buttons.

### ✅ Inline Scanner
- **Action:** Make the QR scanner slide up in a "half-sheet" bottom drawer instead of a full-screen modal.
- **Benefit:** Feels less jarring and maintains context.

**Status (Current Code):** ✅ Implemented
- Scanner now opens as a bottom half-sheet drawer in `apps/web/src/pages/Dashboard.tsx` using the existing Radix Dialog primitives.
- Includes a drag-handle visual and maintains context while scanning.

---

## 3. 💬 Conversation Interface (The Core Loop)

**Current State:**
- **Header:** Crowded with Room Code, Connection Status, Audio Toggle, Leave Button, Language Selector.
- **Footer:** Mic Button, Solo Toggle, Solo Language Selector.
- **Bubbles:** Text-heavy (Original + Translation), consuming vertical space.

**Problem:**
Screen real estate is consumed by "settings" and redundant text rather than the actual conversation.

**Recommendations:**

### ✅ Header Simplification
- **Action:** Move "Room Code" and "Language Selector" to a "Settings" gear icon or side sheet.
- **Keep:** Only the "Status" indicator and "Leave" button should be visible at top-level.
- **Benefit:** A cleaner, focused view that emphasizes the content.

**Status (Current Code):** ✅ Implemented
- Header shows the room code in the top bar (tap opens the QR invite modal).
- Participants count is displayed next to the room code.
- Language + solo mode controls are in a settings dialog.

### ✅ Immersive Mic UI
- **Action:** Update the Mic button interaction.
    - **Visuals:** When recording, dim the rest of the interface and show a dynamic "waveform" or "glow" animation behind the button.
    - **Haptics:** Add `navigator.vibrate()` feedback when pressing/releasing the mic.
- **Benefit:** Provides physical and visual confirmation of state without needing to stare at the button, increasing immersion.

**Status (Current Code):** ✅ Implemented
- Haptics wrapper exists (`apps/web/src/lib/haptics.ts`) and is used by the mic control (`apps/web/src/pages/conversation/components/ConversationControls.tsx`).
- Recording now dims the rest of the interface with a full-screen overlay.
- A dynamic waveform/glow animation renders behind the mic button while recording.

### ✅ Relocate "Solo Mode"
- **Action:** Move the "Solo" toggle and "Translate To" selector out of the primary footer. Place them in the "Settings" sheet or a specific "Practice Mode" tab.
- **Benefit:** The footer becomes dedicated *only* to the primary action (Speaking), reducing cognitive load.

**Status (Current Code):** ✅ Implemented
- Solo mode and target language are controlled from the room settings dialog.

### ✅ Message Bubble Clarity
- **Action:** Collapse the "Original Text" by default (e.g., show a small "Show Original" icon) or reduce its opacity significantly.
- **Benefit:** The user primarily wants to read the translation. Reducing density makes the chat easier to scan.

**Status (Current Code):** ✅ Implemented
- The original text is collapsed by default with a per-message toggle ("Show original" / "Hide original") in `apps/web/src/pages/conversation/components/MessageList.tsx`.

---

## 4. 📱 Mobile Core (PWA Polish)

**Recommendations:**

### ✅ Wake Lock
- **Action:** Implement the **Screen Wake Lock API**.
- **Reason:** Currently, if a user is listening to a long translation, their phone screen might turn off, cutting the connection or audio. The app must keep the screen awake while connected.

**Status (Current Code):** ✅ Implemented
- Wake lock is enabled while connected in the conversation view.

### ✅ Safe Area Insets
- **Action:** Ensure bottom padding accounts for the iOS "Home Indicator" bar.
- **Reason:** Prevents the Mic button from sitting too low or being overlapped by system gestures.

**Status (Current Code):** 🟡 Partially implemented
- The dashboard FAB accounts for `env(safe-area-inset-bottom)` in `apps/web/src/pages/dashboard/DashboardQuickActionsFab.tsx`.
- The rest of the UI should still be visually verified on iOS (especially the conversation footer).

---

## 🛠 Proposed Implementation Priorities

1. ✅ **Dashboard:** Implement **Inline Scanner** (half-sheet UI). — Done.
2. ✅ **Conversation UI:** Finish **Immersive Mic UI** visuals (add dimming + waveform/glow). — Done.
3.  **Onboarding:** Add **Biometric Auth for PWA** (WebAuthn).
4.  **Mobile polish:** Verify/extend **Safe Area Insets** in conversation footer on real iOS devices.
5.  **Practice polish:** Replace `ScriptProcessorNode` playback with an **AudioWorklet** path for lower latency.
