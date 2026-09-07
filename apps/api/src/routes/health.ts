import { Router } from "express";
import type { HealthResponse } from "@rmixerp/contract";

export const healthRouter = Router();

healthRouter.get("/health", (_req, res) => {
  const body: HealthResponse = { status: "ok", time: new Date().toISOString() };
  res.status(200).json(body);
});
