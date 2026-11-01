declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    CLASSLY_ADMIN_EMAIL?: string;
    CLASSLY_ADMIN_PASSWORD_HASH?: string;
    CLASSLY_SESSION_SECRET?: string;
  }
}
