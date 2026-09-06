import express, { type NextFunction, type Request, type Response } from "express";
import { pinoHttp } from "pino-http";
import { logger } from "./logger";
import { healthRouter } from "./routes/health";
import { authRouter } from "./routes/auth";

export function createApp() {
  const app = express();

  app.use(pinoHttp({ logger }));
  app.use(express.json());

  app.use("/api", healthRouter);
  app.use("/api", authRouter);

  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: { message: "Not found", code: "not_found" } });
  });

  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    req.log?.error({ err }, "unhandled error");
    res.status(500).json({ error: { message: "Internal server error", code: "internal_error" } });
  });

  return app;
}
