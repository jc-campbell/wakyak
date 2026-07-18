const isTailscaleOrigin =
  Boolean(import.meta.env.VITE_TAILSCALE_HOST) &&
  window.location.hostname === import.meta.env.VITE_TAILSCALE_HOST;

const developmentApiOrigin = isTailscaleOrigin
  ? window.location.origin
  : import.meta.env.VITE_API_ORIGIN || "http://localhost:4000";

export const apiOrigin = (
  import.meta.env.MODE === "development"
    ? developmentApiOrigin
    : window.location.origin
).replace(/\/$/, "");
