import express from "express";
import { parseCookies as parseCookieHeader } from "./cookie-parse.js";
import { AUTH_COOKIE_NAME, verifyAuthToken } from "../services/auth-session.js";

export { parseCookieHeader as parseCookies };

export const authenticate = async (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => {
  const cookies = parseCookieHeader(req.headers.cookie);
  const token = cookies[AUTH_COOKIE_NAME];
  if (!token) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  try {
    const result = await verifyAuthToken(token);
    if (!result) {
      return res.status(401).json({ error: "Invalid token" });
    }
    req.user = result.user as Express.Request["user"];
    (req as express.Request & { sessionId?: string }).sessionId = result.sessionId;
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
};
