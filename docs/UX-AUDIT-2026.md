# UX/UI Audit & Improvement Roadmap (2026–07)

A fresh review of the Live Translator web app based on the current codebase, superseding the January 2026 audit.

The app is now a functional PWA with three primary surfaces: **Dashboard** (room entry), **Conversation** (multi-user translated voice chat), and **Practice** (solo Grok Voice speech-to-speech). The core translation loop works well; the remaining UX work is mostly about removing friction, finishing mobile polish, and making failure states understandable.

---

## 1. Current UX State

### Strengths
- **Clear core loop.** Dashboard exposes create, scan, manual join, and recent rooms above the fold.
- **Touch-first recording.** `ConversationControls` differentiates push-to-talk (mobile) from tap-to-talk (desktop) and supports hold-and-drag-to-lock.
- **Smooth guest fallback.** Unauthenticated users can create/join/scan after entering only a display name; pending actions resume after guest sign-in.
- **Visual room onboarding.** After creating a room, a large QR code + monospace room code make sharing easy.
- **Scaffolded PWA features.** Bottom nav, install banner, wake lock, haptics, and status-bar meta tags are already wired in.

### Weaknesses
1. **Mobile safe areas are not handled.** `Layout`, `BottomNav`, and `ConversationControls` use fixed bottom padding with no `env(safe-area-inset-bottom)`. On iOS the home indicator can cover the mic button and bottom nav. `index.html` also lacks `viewport-fit=cover`.
2. **Conversation feedback is too subtle.** Connection state is only a small colored dot; the disabled-mic state when alone is explained only by a small hint and a Settings link. There is no empty-state guidance when joining an empty room.
3. **Dashboard still has friction.** The room-code input is `type="text"` with no auto-formatting; the QR scanner half-sheet is forced to a mobile layout even on desktop; only two recent rooms are shown with no metadata or way to clear them.
4. **Practice feels unfinished.** It has hardcoded English copy, no wake lock, no haptics, no intro/empty state, and no way to replay the last spoken translation.
5. **Error/empty surfaces are inconsistent.** `EmptyState` and `ErrorState` components exist but are under-used; many failures rely on `sonner` toasts that are easy to miss.
6. **i18n gaps remain.** `Practice.tsx`, `StatusIndicator.tsx`, and `DebugPanel.tsx` contain hardcoded English strings.
7. **PWA install metadata is incomplete.** There are SVG icons in `public/` but no `manifest.json` and no `<link rel="manifest">` in `index.html`.
8. **Audio and solo-mode controls are unclear.** The volume icon toggles text-to-speech but has no label or tooltip. “Solo mode” is buried in Settings and the term is not self-explanatory.

---

## 2. Recommended Improvements (ranked)

### 1. Fix mobile safe areas and viewport-fit
**Why:** The mic button and bottom nav are the most-tapped controls; on iOS they can be hidden by the home indicator or overlap the status bar.  
**Expected impact:** High. Low effort.  
**Files:** `apps/web/index.html`, `apps/web/src/components/Layout.tsx`, `apps/web/src/components/BottomNav.tsx`, `apps/web/src/pages/conversation/components/ConversationControls.tsx`, `apps/web/src/index.css`.

### 2. Surface connection/participant state inline in the conversation
**Why:** A tiny colored dot is not enough. Users need to know why the mic is disabled and how to start speaking when alone.  
**Expected impact:** High.  
**Files:** `RoomHeader.tsx`, `ConversationControls.tsx`, `Conversation.tsx`, `locales/en.json`.

### 3. Add empty-state guidance and inline error surfaces
**Why:** A blank message list on first join is disorienting; generic toasts for connection failures are easy to miss. Use the existing `EmptyState`/`ErrorState` components and inline banners.  
**Expected impact:** Medium-high.  
**Files:** `MessageList.tsx`, `Conversation.tsx`, `Dashboard.tsx`, `Practice.tsx`, `locales/en.json`.

### 4. Add a proper PWA manifest and install metadata
**Why:** Without `manifest.json`, add-to-homescreen relies on browser heuristics rather than the app’s name, theme, and icons.  
**Expected impact:** Medium. Quick win.  
**Files:** `apps/web/public/manifest.json`, `apps/web/index.html`.

### 5. Polish the Dashboard entry flow
**Why:** Reduce mis-taps and input friction before users ever reach a room.  
**Specific changes:**
- Auto-format and validate the room-code input.
- Use a centered modal for the QR scanner on desktop, keep the half-sheet on mobile.
- Show more than two recent rooms, with last-used metadata and a clear action.
- Make the install banner less dominant on repeat visits.
**Expected impact:** Medium.  
**Files:** `Dashboard.tsx`, `useQRScanner.ts`, `useRecentRooms.ts`, `usePwaBanner.ts`.

### 6. Finish Practice mode polish
**Why:** Practice is a first-class feature but still feels like a prototype.  
**Specific changes:**
- Internationalize all copy.
- Add wake lock and haptic feedback.
- Add an intro/empty state.
- Add a replay button for the last spoken translation.
**Expected impact:** Medium.  
**Files:** `Practice.tsx`, `useWakeLock.ts`, `haptics.ts`, `locales/*.json`.

### 7. Internationalize remaining hardcoded strings
**Why:** The app is localized everywhere except Practice and a few helper components. Practice is the page most likely to be shown to language learners.  
**Expected impact:** Medium.  
**Files:** `Practice.tsx`, `DebugPanel.tsx`, `StatusIndicator.tsx`, `locales/*.json`.

### 8. Clarify audio and solo-mode controls
**Why:** The volume icon toggles TTS but has no label. “Solo mode” is jargon buried in Settings.  
**Specific changes:**
- Add a tooltip or `sr-only` label to the audio toggle.
- Surface a one-tap “Practice / Solo” action when the user is the only participant.
- Rename or explain “Solo mode” in the UI.
**Expected impact:** Medium.  
**Files:** `RoomHeader.tsx`, `ConversationControls.tsx`, `locales/en.json`.

---

## 3. Implementation Priorities

1. **Safe areas & viewport-fit** — unblock reliable mobile tapping first.
2. **Inline connection/empty states in conversation** — biggest clarity win for active users.
3. **PWA manifest + install metadata** — quick installability win.
4. **Dashboard entry-flow polish** — reduce drop-off before users enter a room.
5. **Practice wake lock + haptics + i18n** — finish the mobile practice experience.
6. **Empty/error states across surfaces** — make failures recoverable.
7. **Audio/solo-mode clarity** — polish the conversation chrome.
8. **Device QA** — test iOS Safari, Android Chrome, and standalone PWA modes against the changes.

---

## 4. Out of scope for this audit

- **Multi-user Rooms S2S redesign** is tracked separately in `docs/rooms-and-practice-redesign.md`.
- **AudioWorklet playback in Practice** is also tracked there.
- **Backend features** such as password reset, email verification, and transcript persistence are architecture/ops work, not UX polish.
