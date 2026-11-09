import { getFirebaseAuth } from "./firebase-client";

let cachedToken: string | null = null;
let tokenExpiry = 0;

async function getIdToken(): Promise<string | null> {
  const auth = getFirebaseAuth();
  const user = auth.currentUser;

  if (!user) return null;

  // Refresh if token expires in next 30 seconds
  if (cachedToken && Date.now() < tokenExpiry - 30_000) {
    return cachedToken;
  }

  try {
    const token = await user.getIdToken();
    const decoded = JSON.parse(atob(token.split(".")[1]!));
    cachedToken = token;
    tokenExpiry = (decoded["exp"] as number) * 1000;
    return token;
  } catch {
    return null;
  }
}

function clearTokenCache() {
  cachedToken = null;
  tokenExpiry = 0;
}

export interface ApiError {
  code: string;
  message: string;
  fieldErrors?: { field: string; message: string }[];
  /** Extra context, e.g. { reason: "quote_changed", quote } on a 409. */
  details?: Record<string, unknown>;
  requestId: string;
}

export interface ApiResponse<T> {
  data: T | null;
  error: ApiError | null;
  status: number;
}

/** First field message if present, otherwise the error message. */
export function errorText(error: ApiError | null | undefined, fallback: string): string {
  if (!error) return fallback;
  return error.fieldErrors?.[0]?.message ?? error.message ?? fallback;
}

export async function apiFetch<T>(
  path: string,
  options: {
    method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    body?: unknown;
    auth?: boolean;
  } = {},
): Promise<ApiResponse<T>> {
  const { method = "GET", body, auth = true } = options;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (auth) {
    const token = await getIdToken();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
  }

  // Use same-origin proxy (/api → Next.js rewrite → API /v1) to avoid CORS issues
  const url = `/api${path}`;

  const doFetch = async (currentHeaders: typeof headers): Promise<Response> => {
    return fetch(url, {
      method,
      headers: currentHeaders,
      body: body ? JSON.stringify(body) : undefined,
    });
  };

  try {
    let response = await doFetch(headers);

    // One safe retry on 401
    if (response.status === 401 && auth) {
      const firebaseAuth = getFirebaseAuth();
      if (firebaseAuth.currentUser) {
        // Force token refresh
        cachedToken = null;
        tokenExpiry = 0;
        const newToken = await firebaseAuth.currentUser.getIdToken(true);
        if (newToken) {
          headers["Authorization"] = `Bearer ${newToken}`;
          response = await doFetch(headers);
        }
      }
    }

    const text = await response.text();
    const parsed = text ? JSON.parse(text) : null;

    // An admin suspended this account: end the session and explain on the sign-in page.
    if (response.status === 403 && parsed?.error?.details?.reason === "account_suspended" && typeof window !== "undefined") {
      cachedToken = null;
      tokenExpiry = 0;
      await getFirebaseAuth().signOut().catch(() => undefined);
      if (!window.location.pathname.startsWith("/sign-in")) window.location.assign("/sign-in?suspended=1");
    }

    if (!response.ok) {
      return {
        data: null,
        error: parsed?.error ?? {
          code: "UNKNOWN",
          message: "Request failed",
          requestId: "unknown",
        },
        status: response.status,
      };
    }

    return { data: parsed as T, error: null, status: response.status };
  } catch {
    return {
      data: null,
      error: {
        code: "NETWORK_ERROR",
        message: "Could not reach the server",
        requestId: "unknown",
      },
      status: 0,
    };
  }
}

export { clearTokenCache };
