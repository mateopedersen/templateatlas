declare module "cloudflare:workers" {
  export const env: { DB: import("@cloudflare/workers-types/index").D1Database };
}
