import path from "node:path";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { corsOrigins, env, isProd } from "./config/env.js";
import { errorHandler, notFoundHandler } from "./lib/http.js";
import { prisma } from "./lib/prisma.js";
import { adminRouter } from "./routes/admin/index.js";
import { authRouter } from "./routes/auth.js";
import { publicRouter } from "./routes/public.js";
import { storage } from "./storage/index.js";

export function createApp() {
  const app = express();
  app.set("trust proxy", 1);
  app.disable("x-powered-by");

  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
  app.use(cors({ origin: corsOrigins, credentials: true }));
  app.use(express.json({ limit: "2mb" }));
  app.use(cookieParser());
  app.use(morgan(isProd ? "combined" : "dev"));

  app.get("/health", async (_req, res) => {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true, storage: storage.name });
  });

  // Locally stored uploads (STORAGE_DRIVER=local). With S3, files are served by the bucket/CDN.
  if (env.STORAGE_DRIVER === "local") {
    app.use("/uploads", express.static(path.resolve(env.LOCAL_UPLOAD_DIR), { maxAge: "365d", immutable: true, index: false }));
  }

  app.use("/api/public", publicRouter);
  app.use("/api/auth", authRouter);
  app.use("/api/admin", adminRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
