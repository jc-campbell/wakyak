import { BrevoClient } from "@getbrevo/brevo";

import type { Env } from "../config/env.js";

export type AuthEmailType = "verification" | "password-reset";

export interface AuthEmail {
  to: string;
  type: AuthEmailType;
  url: string;
}

export interface EmailService {
  send(message: AuthEmail): Promise<void>;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export class InMemoryEmailService implements EmailService {
  readonly messages: AuthEmail[] = [];

  send(message: AuthEmail): Promise<void> {
    this.messages.push(message);
    return Promise.resolve();
  }
}

export function createEmailService(env: Env): EmailService {
  if (env.EMAIL_MODE === "console") {
    return {
      send(message) {
        console.info(
          `[email:console] Not delivered; recipient=${message.to} type=${message.type} url=${message.url}`,
        );
        return Promise.resolve();
      },
    };
  }

  const client = new BrevoClient({ apiKey: env.BREVO_API_KEY! });
  return {
    async send(message) {
      const purpose =
        message.type === "verification"
          ? "verify your email"
          : "reset your password";
      const subject =
        message.type === "verification"
          ? "Verify your email"
          : "Reset your password";
      const safeUrl = escapeHtml(message.url);

      await client.transactionalEmails.sendTransacEmail({
        sender: { email: env.EMAIL_FROM_ADDRESS!, name: env.EMAIL_FROM_NAME! },
        to: [{ email: message.to }],
        subject,
        textContent: `Use this link to ${purpose}: ${message.url}`,
        htmlContent: `<p>Use the link below to ${purpose}.</p><p><a href="${safeUrl}">${subject}</a></p>`,
      });
    },
  };
}
