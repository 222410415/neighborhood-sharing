import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { json, urlencoded } from "express";
import { config } from "dotenv";
import { AppModule } from "./app.module.js";

config();

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // JSON for API endpoints
  app.use(json({ limit: "1mb" }));
  // URL-encoded for form data (not multipart)
  app.use(urlencoded({ extended: true }));
  app.setGlobalPrefix("v1");
  // The web app calls the API through its own /api proxy, so browsers rarely
  // need CORS. Extra origins (for example the hosted web URL) come from
  // CORS_ALLOWED_ORIGINS, comma-separated.
  const extraOrigins = (process.env["CORS_ALLOWED_ORIGINS"] ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({
    origin: [
      "http://127.0.0.1:3000",
      "http://localhost:3000",
      ...extraOrigins,
    ],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    credentials: true,
  });

  const port = parseInt(process.env["PORT"] ?? "3001", 10);
  await app.listen(port);
  console.log(`NestJS API started on port ${port}`);
  console.log(`FIREBASE_AUTH_EMULATOR_HOST: ${process.env["FIREBASE_AUTH_EMULATOR_HOST"] ?? "not set"}`);
}

bootstrap().catch((err) => {
  console.error("Failed to start API", err);
  process.exit(1);
});
