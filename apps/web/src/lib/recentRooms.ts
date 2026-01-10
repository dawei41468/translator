type RecentRoom = {
  code: string;
  lastUsedAt: number;
};

const STORAGE_KEY = "recent_rooms_v1";
const MAX_ROOMS = 5;

function safeParse(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function getRecentRooms(): RecentRoom[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const parsed = safeParse(raw);
    if (!Array.isArray(parsed)) return [];

    const cleaned: RecentRoom[] = parsed
      .map((r) => {
        if (!r || typeof r !== "object") return null;
        const rr = r as any;
        const code = typeof rr.code === "string" ? rr.code.trim().toUpperCase() : "";
        const lastUsedAt = typeof rr.lastUsedAt === "number" ? rr.lastUsedAt : 0;
        if (!code) return null;
        return { code, lastUsedAt } satisfies RecentRoom;
      })
      .filter(Boolean) as RecentRoom[];

    cleaned.sort((a, b) => b.lastUsedAt - a.lastUsedAt);
    return cleaned.slice(0, MAX_ROOMS);
  } catch {
    return [];
  }
}

export function addRecentRoom(code: string): void {
  if (typeof window === "undefined") return;
  const normalized = (code || "").trim().toUpperCase();
  if (!normalized) return;

  try {
    const now = Date.now();
    const current = getRecentRooms();
    const next: RecentRoom[] = [
      { code: normalized, lastUsedAt: now },
      ...current.filter((r) => r.code !== normalized),
    ].slice(0, MAX_ROOMS);

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

export function clearRecentRooms(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
