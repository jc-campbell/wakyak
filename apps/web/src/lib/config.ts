export const apiOrigin = (
  import.meta.env.VITE_API_ORIGIN || "http://localhost:4000"
).replace(/\/$/, "");
