import express from "express";

export const sanitizeInput = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (req.body) {
    Object.keys(req.body).forEach((key) => {
      if (typeof req.body[key] === "string") {
        req.body[key] = req.body[key].trim();
      }
    });
  }

  if (req.query?.search && typeof req.query.search === "string") {
    req.query.search = req.query.search.replace(/[%_\\]/g, "");
  }

  next();
};
