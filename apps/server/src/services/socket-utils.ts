import { logger } from '../logger.js';

export function normalizeLang(lang: string | null | undefined): string {
  const raw = (lang ?? "").trim();
  if (!raw) return "en";
  return raw.replace(/_/g, "-").split("-")[0]!.toLowerCase();
}

export function validateSocketData(
  data: any,
  schema: { [key: string]: (value: any) => boolean }
): boolean {
  for (const [key, validator] of Object.entries(schema)) {
    if (!(key in data)) {
      if (!validator(undefined)) {
        return false;
      }
      continue;
    }
    if (!validator(data[key])) {
      return false;
    }
  }
  return true;
}

export async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 1000
): Promise<T> {
  let lastError: any;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, delay * attempt));
      }
    }
  }

  throw lastError;
}

export function isRecoverableSttError(err: any): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.toLowerCase().includes("incomplete envelope")) return true;
  if (msg.toLowerCase().includes("connection reset by peer")) return true;
  if (msg.toLowerCase().includes("econnreset")) return true;
  if (msg.toLowerCase().includes("rst_stream")) return true;
  if (msg.toLowerCase().includes("maximum allowed stream duration")) return true;
  if (msg.toLowerCase().includes("audio timeout")) return true;
  if (msg.toLowerCase().includes("deadline exceeded")) return true;
  if (typeof err === "object" && err !== null && "code" in err) {
    const code = (err as any).code;
    if (code === 14 || code === 2) return true;
  }
  return false;
}

export function canRestartStt(socket: {
  sttRestartWindowStartedAt?: number;
  sttRestartCount?: number;
}): boolean {
  const now = Date.now();
  const windowMs = 30_000;
  const maxRestarts = 3;

  if (
    !socket.sttRestartWindowStartedAt ||
    now - socket.sttRestartWindowStartedAt > windowMs
  ) {
    socket.sttRestartWindowStartedAt = now;
    socket.sttRestartCount = 0;
  }

  const count = socket.sttRestartCount ?? 0;
  if (count >= maxRestarts) return false;

  socket.sttRestartCount = count + 1;
  return true;
}

export function handleSocketError(
  socket: { emit: (event: string, data: any) => void },
  event: string,
  error: any,
  userMessage?: string,
  logContext?: any
) {
  const errorId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  logger.error(`Socket error in ${event}`, {
    errorId,
    event,
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    ...logContext,
  });

  const message = userMessage || "An unexpected error occurred";
  socket.emit("error", { message, errorId });
}

export function isUniqueViolation(error: any): boolean {
  if (!error) return false;
  if (error.code === "23505") return true;
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("23505");
}
