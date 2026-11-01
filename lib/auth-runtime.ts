import { env } from "cloudflare:workers";
import type { AuthConfig } from "./auth";

export function getAuthConfig(): AuthConfig {
  return {
    adminEmail: env.CLASSLY_ADMIN_EMAIL,
    adminPasswordHash: env.CLASSLY_ADMIN_PASSWORD_HASH,
    sessionSecret: env.CLASSLY_SESSION_SECRET,
  };
}
