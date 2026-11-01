declare module 'cloudflare:workers' {
  export const env: {
    DB: import('@cloudflare/workers-types/index').D1Database;
  };
}
declare namespace App {
  interface Locals {
    held?: Set<string>;
  }
}
