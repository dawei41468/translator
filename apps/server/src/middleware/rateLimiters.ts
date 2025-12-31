import rateLimit, { ipKeyGenerator } from "express-rate-limit";

// API rate limiter - per user, not per IP (employees may share office IPs)
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 300, // 5 requests/second per user - reasonable for business use
  keyGenerator: (req) => req.user?.id || ipKeyGenerator(req.ip || "unknown"), // Per-user tracking with IPv6 support
  message: { error: "Too many requests" },
  standardHeaders: true,
  legacyHeaders: false,
});

// Admin endpoints rate limiter - stricter for admin operations
export const adminLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute for admin operations
  keyGenerator: (req) => req.user?.id || ipKeyGenerator(req.ip || "unknown"),
  message: { error: "Too many admin requests" },
  standardHeaders: true,
  legacyHeaders: false,
});

// File upload rate limiter - most restrictive
export const uploadLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 20, // 20 uploads per 5 minutes
  keyGenerator: (req) => req.user?.id || ipKeyGenerator(req.ip || "unknown"),
  message: { error: "Too many file uploads" },
  standardHeaders: true,
  legacyHeaders: false,
});
