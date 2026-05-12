/// <reference path="../.astro/types.d.ts" />
/// <reference types="@cloudflare/workers-types" />

interface ImportMetaEnv {
  readonly RESEND_API_KEY?: string;
}

declare namespace App {
  interface Locals {
    session?: { id: string; email: string };
  }
}
