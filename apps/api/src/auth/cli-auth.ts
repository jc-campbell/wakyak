import { createAuth } from "./auth.js";
import { createEmailService } from "./email.js";
import { loadEnv } from "../config/env.js";

const env = loadEnv();

export const auth = createAuth(env, createEmailService(env));
