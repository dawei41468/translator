import express from "express";
import { ZodError, type ZodSchema } from "zod";
import { getRequestContext, logWarn } from "../logger.js";

export const validateQuery = (schema: ZodSchema) => (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    req.query = schema.parse(req.query);
    next();
  } catch (err) {
    if (err instanceof ZodError) {
      logWarn("Query parameter validation failed", {
        ...getRequestContext(req),
        errors: (err as ZodError).errors,
        endpoint: req.path,
        method: req.method,
      });
      return res.status(400).json({ error: "Invalid query parameters", details: err.errors });
    }
    next(err);
  }
};
