/**
 * Minimal fetch wrapper for the Resolve AI API (see docs/API.md §6).
 *
 * The base URL is inlined at build time from NEXT_PUBLIC_API_BASE_URL and
 * defaults to the hosted API, so a plain `npm run dev` shows live data.
 */
export const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://resolve-ai-production-8093.up.railway.app/api/v1"
).replace(/\/+$/, "");

export interface ApiErrorDetail {
  path?: string;
  message: string;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: ApiErrorDetail[],
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface ApiEnvelope<T> {
  data: T;
  meta?: { page: number; pageSize: number; total: number };
}

type Method = "GET" | "POST" | "PATCH";

export async function api<T>(path: string, init?: { method?: Method; body?: unknown }): Promise<ApiEnvelope<T>> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method: init?.method ?? "GET",
      headers: init?.body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
    });
  } catch {
    throw new ApiError(0, "NETWORK_ERROR", "The Resolve AI API could not be reached.");
  }

  const json = (await res.json().catch(() => null)) as
    | (ApiEnvelope<T> & { error?: { code?: string; message?: string; details?: ApiErrorDetail[] } })
    | null;

  if (!res.ok) {
    if (res.status === 429) {
      const reset = /reset=(\d+)/.exec(res.headers.get("RateLimit") ?? "")?.[1];
      throw new ApiError(
        429,
        "RATE_LIMITED",
        `Too many requests. Try again in ${reset ?? "a few"} seconds.`,
      );
    }
    throw new ApiError(
      res.status,
      json?.error?.code ?? "UNKNOWN",
      json?.error?.message ?? res.statusText,
      json?.error?.details,
    );
  }
  if (!json) throw new ApiError(res.status, "INVALID_RESPONSE", "The API returned an empty response.");
  return json;
}

/** A readable message for any thrown value (API errors carry the server's own explanation). */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    const detail = err.details?.map((d) => d.message).join("; ");
    return detail ? `${err.message}: ${detail}` : err.message;
  }
  return err instanceof Error ? err.message : "Something went wrong.";
}
