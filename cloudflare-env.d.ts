declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    AUTH_PEPPER?: string;
    TEACHER_EMAILS?: string;
    BUCKET?: R2Bucket;
  }
}
