import express from "express";
import type { Request, Response } from "express";
import cookieParser from "cookie-parser";
import session from "express-session";
import pinoHttp from "pino-http";
import swaggerUi from "swagger-ui-express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./config.js";
import { logger } from "./logger.js";
import { connectMongo, mongoConnectionState } from "./db/connection.js";
import { createApiRouter } from "./api/members.router.js";
import { getOpenApiDocument } from "./api/openapi.js";

const config = loadConfig();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.resolve(__dirname, "..", "public");

export async function createApp(): Promise<express.Express> {
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  app.use(pinoHttp({ logger }));
  app.use(express.json({ limit: "512kb" }));
  app.use(express.urlencoded({ extended: false }));
  app.use(cookieParser());
  app.use(
    session({
      name: "rsm.sid",
      secret: config.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: config.NODE_ENV === "production",
        maxAge: 1000 * 60 * 60 * 8,
      },
    }),
  );

  app.get("/healthz", (_req: Request, res: Response) => {
    const mongo = mongoConnectionState();
    const status = mongo === "connected" ? "ok" : "degraded";
    const code = mongo === "connected" ? 200 : 503;
    res.status(code).json({
      status,
      atlas: mongo,
      uptime: Math.round(process.uptime()),
    });
  });

  const openapi = await getOpenApiDocument();
  app.get("/api/openapi.json", (_req: Request, res: Response) => {
    res.json(openapi);
  });
  app.use("/docs", swaggerUi.serve, swaggerUi.setup(openapi, {
    customSiteTitle: "Ramblers Salesforce API (mock)",
    swaggerOptions: {
      persistAuthorization: true,
    },
  }));

  app.use(createApiRouter());

  app.use(express.static(publicDir, { index: false }));

  app.get("/", (_req: Request, res: Response) => {
    res.redirect("/docs");
  });

  return app;
}

async function main(): Promise<void> {
  await connectMongo();
  const app = await createApp();
  app.listen(config.PORT, () => {
    logger.info(
      { port: config.PORT, baseUrl: config.PUBLIC_BASE_URL },
      "ramblers-salesforce-mock listening",
    );
  });
}

const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  main().catch((err: unknown) => {
    logger.error({ err }, "fatal bootstrap error");
    process.exit(1);
  });
}
