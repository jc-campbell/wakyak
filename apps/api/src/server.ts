import { disconnectDatabase } from "@wakyak/database";

import { buildApp } from "./app.js";
import { loadEnv } from "./config/env.js";

const env = loadEnv();
const app = await buildApp({ env });
let closing = false;

async function shutdown(signal: string): Promise<void> {
  if (closing) return;
  closing = true;
  app.log.info({ signal }, "Shutting down");
  try {
    await app.close();
    await disconnectDatabase();
    process.exitCode = 0;
  } catch (error) {
    app.log.error({ err: error }, "Shutdown failed");
    process.exitCode = 1;
  }
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

try {
  await app.listen({ host: env.API_HOST, port: env.API_PORT });
} catch (error) {
  app.log.error({ err: error }, "API failed to start");
  await disconnectDatabase();
  process.exitCode = 1;
}
