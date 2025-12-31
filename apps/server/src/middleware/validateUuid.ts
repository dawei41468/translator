import express from "express";

export const validateUuid = (paramName: string) => (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const value = req.params[paramName];
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    return res.status(400).json({ error: `Invalid ${paramName} format` });
  }
  next();
};
