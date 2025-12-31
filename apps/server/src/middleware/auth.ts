import express from "express";
import jwt from "jsonwebtoken";
import type { JwtPayload } from "jsonwebtoken";
import { db } from "../../../../packages/db/src/index.js";
import { users } from "../../../../packages/db/src/schema.js";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const AUTH_COOKIE_NAME = "auth_token";

export function parseCookies(cookieHeader: string | undefined): Record<string, string> {
    if (!cookieHeader) return {};
    return cookieHeader
        .split(";")
        .map((part) => part.trim())
        .filter(Boolean)
        .reduce<Record<string, string>>((acc, part) => {
            const eqIdx = part.indexOf("=");
            if (eqIdx === -1) return acc;
            const key = part.slice(0, eqIdx).trim();
            const value = part.slice(eqIdx + 1).trim();
            acc[key] = decodeURIComponent(value);
            return acc;
        }, {});
}

function getUserIdFromJwtPayload(payload: string | JwtPayload): string | null {
    if (typeof payload === "string") return null;
    const userId = payload["userId"];
    return typeof userId === "string" ? userId : null;
}

export const authenticate = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const cookies = parseCookies(req.headers.cookie);
    const token = cookies[AUTH_COOKIE_NAME];
    if (!token) {
        return res.status(401).json({ error: "Not authenticated" });
    }

    try {
        const verified = jwt.verify(token, JWT_SECRET);
        const userId = getUserIdFromJwtPayload(verified as string | JwtPayload);
        if (!userId) {
            return res.status(401).json({ error: "Invalid token" });
        }
        const user = await db.query.users.findFirst({
            where: (u, { eq }) => eq(u.id, userId),
        });
        if (!user) {
            return res.status(401).json({ error: "User not found" });
        }
        req.user = user as any;
        next();
    } catch (err) {
        res.status(401).json({ error: "Invalid token" });
    }
};
