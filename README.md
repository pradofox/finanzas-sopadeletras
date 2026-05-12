# finanzas.sopadeletras.art

Plataforma de administración financiera personal y de estudio para Roberto y Lili. Source of truth única, accesible desde web, sincronizada con Claude vía API.

## Stack

- Astro 6 + Cloudflare Workers (output: server)
- D1 (SQLite) como única base de datos
- Auth: OTP por email (Resend) + cookie de sesión 30 días
- Allowlist hardcoded a Roberto y Lili

## Setup local

```bash
npm install
npm run dev
```

## Deploy

```bash
npm run deploy
```

(equivale a `rm -rf dist .astro && astro build && wrangler deploy`)

## Secrets requeridos

- `RESEND_API_KEY` — para mandar OTP por email. Configurar con `wrangler secret put RESEND_API_KEY`.

## API para Claude

Endpoints bajo `/api/` aceptan dos formas de auth:

- **Cookie de sesión** (UI humana): vía login OTP en `/login`.
- **Bearer token** (Claude): `Authorization: Bearer <token>`. Tokens se crean en tabla `api_tokens` con `token_hash` (SHA-256). Nunca commitear tokens al repo.

Endpoint clave: `GET /api/state` devuelve snapshot completo (cuentas, deuda total, pipeline, próximas fechas).
