import { queryOptions } from "@tanstack/react-query";

import { apiOrigin } from "@/lib/config";

export interface PublicProfile {
  userId: string;
  handle: string;
  displayName: string;
}

export interface MeResponse {
  user: {
    id: string;
    email: string;
    emailVerified: boolean;
  };
  profile: PublicProfile | null;
}

interface ApiErrorBody {
  error?: {
    code?: string;
    message?: string;
  };
  message?: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiOrigin}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      ...(init?.body === undefined
        ? {}
        : { "content-type": "application/json" }),
      ...init?.headers,
    },
  });

  const body = (await response.json().catch(() => ({}))) as ApiErrorBody;

  if (!response.ok) {
    throw new ApiError(
      body.error?.message ??
        body.message ??
        "The request could not be completed.",
      response.status,
      body.error?.code,
    );
  }

  return body as T;
}

export const meQueryOptions = queryOptions({
  queryKey: ["me"],
  queryFn: () => apiRequest<MeResponse>("/v1/me"),
  retry: false,
  staleTime: 0,
});

export async function createProfile(input: {
  userId: string;
  handle: string;
  displayName: string;
}): Promise<PublicProfile> {
  const result = await apiRequest<{ profile: PublicProfile }>("/v1/profile", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return result.profile;
}
