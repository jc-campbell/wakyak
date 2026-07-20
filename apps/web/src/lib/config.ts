const developmentApiOrigin =
  import.meta.env.VITE_API_ORIGIN ||
  (typeof window === "undefined"
    ? "http://localhost:4000"
    : window.location.origin);

export const apiOrigin = (
  import.meta.env.MODE === "development"
    ? developmentApiOrigin
    : typeof window === "undefined"
      ? "http://localhost:4000"
      : window.location.origin
).replace(/\/$/, "");
