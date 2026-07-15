import { createAuthClient } from "better-auth/react";

import { apiOrigin } from "@/lib/config";

export const authClient = createAuthClient({
  baseURL: apiOrigin,
  fetchOptions: {
    credentials: "include",
  },
});
