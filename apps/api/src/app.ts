import express, { type NextFunction, type Request, type Response } from "express";
import { pinoHttp } from "pino-http";
import { logger } from "./logger";
import { healthRouter } from "./routes/health";
import { authRouter } from "./routes/auth";
import { companyRouter } from "./routes/company";
import { branchesRouter } from "./routes/branches";
import { usersRouter } from "./routes/users";
import { rolesRouter } from "./routes/roles";
import { permissionsRouter } from "./routes/permissions";
import { customersRouter } from "./routes/customers";
import { projectsRouter } from "./routes/projects";
import { productsRouter } from "./routes/products";
import { priceListsRouter } from "./routes/priceLists";
import { chargeTypesRouter } from "./routes/chargeTypes";
import { rawMaterialsRouter } from "./routes/rawMaterials";
import { vendorsRouter } from "./routes/vendors";
import { quotationsRouter } from "./routes/quotations";
import { salesOrdersRouter } from "./routes/salesOrders";
import { mixDesignsRouter } from "./routes/mixDesigns";
import { inventoryRouter } from "./routes/inventory";
import { productionOrdersRouter } from "./routes/productionOrders";

export function createApp() {
  const app = express();

  app.use(pinoHttp({ logger }));
  app.use(express.json());

  app.use("/api", healthRouter);
  app.use("/api", authRouter);
  app.use("/api", companyRouter);
  app.use("/api", branchesRouter);
  app.use("/api", usersRouter);
  app.use("/api", rolesRouter);
  app.use("/api", permissionsRouter);
  app.use("/api", customersRouter);
  app.use("/api", projectsRouter);
  app.use("/api", productsRouter);
  app.use("/api", priceListsRouter);
  app.use("/api", chargeTypesRouter);
  app.use("/api", rawMaterialsRouter);
  app.use("/api", vendorsRouter);
  app.use("/api", quotationsRouter);
  app.use("/api", salesOrdersRouter);
  app.use("/api", mixDesignsRouter);
  app.use("/api", inventoryRouter);
  app.use("/api", productionOrdersRouter);

  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: { message: "Not found", code: "not_found" } });
  });

  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    req.log?.error({ err }, "unhandled error");
    res.status(500).json({ error: { message: "Internal server error", code: "internal_error" } });
  });

  return app;
}
