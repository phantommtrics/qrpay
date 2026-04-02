import type { NextFunction, Request, Response } from "express";

/**
 * Logs each HTTP request when the response finishes (method, path, status, duration).
 * Does not log request bodies to avoid leaking passwords or tokens.
 */
export function httpRequestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  const method = req.method;
  const url = req.originalUrl || req.url;

  res.on("finish", () => {
    const ms = Date.now() - start;
    console.log(`[HTTP] ${method} ${url} ${res.statusCode} ${ms}ms`);
  });

  next();
}
