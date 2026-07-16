const developmentApiOrigin =
  import.meta.env.VITE_API_ORIGIN || "http://localhost:4000";

export const apiOrigin = (
  import.meta.env.MODE === "development"
    ? developmentApiOrigin
    : window.location.origin
).replace(/\/$/, "");
