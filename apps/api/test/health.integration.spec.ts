import { Test } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../src/app.module.js";

describe("Health endpoints (integration)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("v1");
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /v1/health/live returns 200 with status alive", async () => {
    const res = await request(app.getHttpServer()).get("/v1/health/live");

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("status", "alive");
    expect(res.body).toHaveProperty("timestamp");
    expect(res.headers).toHaveProperty("x-request-id");
  });

  it("GET /v1/health/ready returns 200 with dependency info", async () => {
    const res = await request(app.getHttpServer()).get("/v1/health/ready");

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("status");
    expect(res.body).toHaveProperty("timestamp");
    expect(res.body).toHaveProperty("dependencies");
    expect(res.body.dependencies).toHaveProperty("firestore");
    expect(res.body.dependencies).toHaveProperty("auth");
    expect(res.headers).toHaveProperty("x-request-id");
  });

  it("x-request-id header is preserved when provided", async () => {
    const customId = "test-request-id-12345";
    const res = await request(app.getHttpServer())
      .get("/v1/health/live")
      .set("x-request-id", customId);

    expect(res.status).toBe(200);
    expect(res.headers["x-request-id"]).toBe(customId);
  });
});
