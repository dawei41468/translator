# Live Translator Codebase Patterns

**Reference**: See [`project-translator.md`](project-translator.md) for product vision, roadmap, and MVP status.

## Purpose

This document codifies the existing patterns in the Live Translator codebase so new functionality stays consistent. Follow OneProject patterns exactly as they are identical.

## Project Structure

- `apps/server`
  - Express API (TypeScript, ESM)
  - Entry: `apps/server/src/index.ts`
- `apps/web`
  - React + Vite + Tailwind + shadcn/ui
  - Entry: `apps/web/src/main.tsx`, app router: `apps/web/src/App.tsx`
- `packages/db`
  - Drizzle schema + db client
  - Schema: `packages/db/src/schema.ts`

## Backend (apps/server) Patterns

### HTTP API conventions

- Base path: all endpoints live under `/api/*`.
- Success responses: JSON object with a clear top-level key.
  - Examples:
    - `{ user: ... }`
    - `{ rooms: [...] }`
    - `{ room: ... }`
- Error responses: JSON object with top-level `error`.
  - Example: `{ error: "Invalid credentials" }`
- Validation errors (Zod): include `details`.
  - Example: `{ error: "Invalid input", details: [...] }`

### Authentication

- Auth mechanism: cookie-based JWT.
  - Cookie name: `auth_token`
  - Client must send cookies: `credentials: "include"`
- Protected endpoints must use `authenticate` middleware.
- Session model: `GET /api/me` returns `{ user: null }` when not authenticated.

### Validation (Zod)

- All request validation is done with Zod.
  - Body: `schema.parse(req.body)`
  - Query: `schema.parse(req.query)`
- Catch `ZodError` and return 400.

### Database access (Drizzle)

- DB access via `db` from `packages/db`.
- Room expiration:
  - Rooms are hard-deleted after 24 hours via a server cron job.

### Logging

- Implemented: Server logging via `apps/server/src/logger.ts`.
  - `getRequestContext(req)` enriches logs with `user` and `request` info.
  - `requestLogger` middleware (in `apps/server/src/middleware/logger.ts`) logs API activity with duration and status codes.

### Environment and configuration

- `.env` is located at repo root.
- `NODE_ENV=production` influences cookie behavior (`secure: true`).

## Frontend (apps/web) Patterns

### Routing

- Routing uses React Router.
- Private routes are gated via `ProtectedRoute` using `useAuth()`.
- Room joining is QR-first with room code fallback (no public join links).

### Auth state

- `AuthProvider` is the source of truth.
  - On mount, it calls `apiClient.getMe()`.
  - If user has `language`, it calls `i18n.changeLanguage(user.language)`.

### API access

- All network calls are implemented in `apps/web/src/lib/api.ts` via `apiClient`.
- `fetch` must use `credentials: "include"`.
- Errors:
  - Non-2xx should throw an `Error` with additional metadata `{ status, data }`.

### Server state and caching

- Use TanStack Query.
- All server state hooks in `apps/web/src/lib/hooks.ts`:
  - Read hooks via `useQuery`
  - Write hooks via `useMutation`
  - On success, invalidate related keys (list + detail).

### UI and styling

- Tailwind + shadcn-style tokens.
- Use `cn()` from `apps/web/src/lib/utils.ts`.
- UI primitives live in `apps/web/src/components/ui/*`.

### Loading & Empty States

- Skeleton, EmptyState, ErrorState components live in `apps/web/src/components/ui/*`.
  - Skeleton for loading states with customizable dimensions and animations.
    ```typescript
    // Basic usage
    <Skeleton className="h-4 w-1/2" />

    // Card skeleton
    <Skeleton className="h-32 w-full rounded-lg" />
    ```

  - EmptyState for empty data states with optional icon, title, description, and action.
    ```typescript
    // Basic empty state
    <EmptyState
      title={t('rooms.empty.title')}
      action={<Button>Create Room</Button>}
    />

    // With icon and description
    <EmptyState
      icon={Plus}
      title="No conversations found"
      description="Try adjusting your search or filters."
      action={<Button variant="outline">Clear Filters</Button>}
    />
    ```

  - ErrorState for consistent error display with retry functionality.
    ```typescript
    // With retry action
    <ErrorState
      message="Failed to load rooms"
      onRetry={() => refetch()}
    />

    // Without retry
    <ErrorState message="Network error occurred" />
    ```

  - Planned Patterns:
    - Use skeleton loaders for list views (cards/tables) during loading
    - Provide contextual empty states with clear actions (e.g., "Start New Conversation")
    - Include retry functionality for recoverable errors
    - Support i18n for all text content
    - Use responsive skeletons that match the final layout (table vs card views)

### Build

- Vite build uses Rollup `manualChunks` configuration in `apps/web/vite.config.ts` to split large vendor bundles.

### i18n

- `i18next` is initialized in `apps/web/src/lib/i18n.ts`.
- Languages supported: `en`, `zh`, `it`, `de`, `nl`.

## Data model patterns

- Identifiers: `uuid` primary keys.
- Audit columns:
  - `createdAt`
  - `updatedAt` (`$onUpdate(() => sql\`now()\`)`)
  - `deletedAt` present in schema (not used for room expiration; rooms are hard-deleted after 24h).

## API response patterns

- Planned: Room list responses may include server-computed aggregate fields such as participant count and status indicators (rooms not yet implemented).

## Testing Patterns

- **Framework**: Use **Vitest** for both server and web applications.
- **Mocks**: Use `vi.mock()` for external dependencies.
- **Server Tests**: Focus on middleware, utilities, and core business logic (translation flow, room management).
- **Web Tests**: Use `@testing-library/react` for component behavior. Always mock `useAuth` when testing components that depend on authentication.
- **E2E**: Use Playwright for critical user journeys (Login, Room Creation/Join, Speech-to-Text flow).
  - Import utility functions and test their logic (e.g., Web Speech API mocks).
  - Mock database calls when testing business logic in isolation.

### Web (Vitest)

- **Tooling**: Vitest + JSDOM + `@testing-library/react`
- **Pattern**:
  - Use `vi` instead of `jest` for mocking (Vitest native).
  - Wrap components in `AuthProvider`, `BrowserRouter`, and `QueryClientProvider` if needed, or use a custom `render` helper.
  - Smoke tests (rendering) are minimum requirement for complex pages.

### E2E (Playwright)

- **Tooling**: Playwright
- **Location**: `apps/web/tests/e2e/*.spec.ts`
- **Pattern**:
  - Run against a locally running dev/test server.
  - Target critical user journeys: Login, Room Creation/Join, Real-time Translation Test.

## Pattern decisions (authoritative)

- Backend: Express + Drizzle/TDSQL-C PostgreSQL.
- Frontend: React Router + TanStack Query + shadcn/ui + Tailwind.
- Auth: httpOnly cookie JWT.
- Real-time: Socket.io (authenticated via JWT cookie).
- Translation: Google Cloud Translation (asia-east2).
- Deployment: PM2 + NGINX on Tencent Lighthouse HK.