import { Controller, Get } from "@nestjs/common";

export interface HealthResponse {
  status: string;
  timestamp: string;
}

export interface ReadinessResponse {
  status: string;
  timestamp: string;
  dependencies: Record<string, { status: string; detail?: string }>;
}

async function checkEmulator(
  host: string,
  label: string,
): Promise<{ status: string; detail?: string }> {
  if (!host) {
    // No emulator host — cloud mode, no emulator to check
    return { status: "cloud" };
  }
  const url = `http://${host}/`;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    await fetch(url, { signal: controller.signal, method: "GET" });
    clearTimeout(timeout);
    return { status: "connected" };
  } catch {
    return {
      status: "unreachable",
      detail: `${label} at ${host} not reachable`,
    };
  }
}

@Controller("health")
export class HealthController {
  @Get("live")
  liveness(): HealthResponse {
    return { status: "alive", timestamp: new Date().toISOString() };
  }

  @Get("ready")
  async readiness(): Promise<ReadinessResponse> {
    const firestoreHost = process.env["FIRESTORE_EMULATOR_HOST"] ?? "";
    const authHost = process.env["FIREBASE_AUTH_EMULATOR_HOST"] ?? "";

    const [firestore, auth] = await Promise.all([
      checkEmulator(firestoreHost, "Firestore"),
      checkEmulator(authHost, "Auth"),
    ]);

    const deps: Record<string, { status: string; detail?: string }> = {
      firestore,
      auth,
    };

    // In cloud mode, "cloud" means ready (no emulator to check)
    // In emulator mode, "connected" means ready
    const allReady = Object.values(deps).every(
      (d) => d.status === "connected" || d.status === "cloud",
    );

    return {
      status: allReady ? "ready" : "degraded",
      timestamp: new Date().toISOString(),
      dependencies: deps,
    };
  }
}
