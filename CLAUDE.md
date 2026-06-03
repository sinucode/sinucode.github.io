# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

GestiónCrediFácil — a multi-business microcredit ("gota a gota") management system for
Colombia. Monorepo with two independently-installed packages (`backend/`, `frontend/`)
deployed as a **single Vercel app**: the backend runs as a serverless function
(`backend/src/server.ts`) and the frontend is served as a static build. There is **no
root `package.json`** — run npm commands inside each package directory.

## Commands

### Backend (`cd backend`)
- `npm run dev` — dev server via nodemon (port 3000)
- `npm run build` — `prisma generate && tsc`
- `npm run lint` — ESLint over `.ts`
- `npm test` — Jest
- `npx tsc --noEmit` — typecheck without emitting (used as the pre-commit check)
- `npm run prisma:studio` — open Prisma Studio
- `npm run prisma:seed` — seed DB (`tsx prisma/seed.ts`)
- **Schema changes:** run `npx prisma db push` (NOT `prisma migrate`). The Supabase
  pooler has no shadow DB, so this project uses `db push` and keeps **no versioned
  migrations**. Always run `npx prisma generate` after editing the schema.

### Frontend (`cd frontend`)
- `npm run dev` — Vite dev server (port 5173)
- `npm run build` — `tsc && vite build`
- `npm run lint` — ESLint (`--max-warnings 0`)
- `npx tsc --noEmit` — typecheck

There is no test runner on the frontend. Before committing, run `npx tsc --noEmit` in
both packages — this is the project's standard verification.

## Deployment
- Single Vercel app (`vercel.json` at root). Region `pdx1` to match the Supabase DB.
- Pushing to `main` triggers the Vercel deploy. The git remote is
  `github.com/sinucode/sinucode.github.io`; production URL `sinucode-github-io.vercel.app`.
- A Vercel cron hits `/api/accounts/closes/auto-run` nightly (23:59 Bogotá) to auto-close
  cash for every business. It requires the `CRON_SECRET` env var (header `x-cron-secret`
  or `Authorization: Bearer`).
- DB connection uses two URLs: `DATABASE_URL` (port 6543, pgbouncer) + `DIRECT_URL`
  (port 5432).

## Backend architecture
Strict three-layer flow per domain: **route → controller → service → Prisma**.
- `routes/*.routes.ts` — express-validator chains + middleware, mounted in `server.ts`
  under `/api/<domain>`.
- `controllers/*.controller.ts` — thin HTTP adapters. Standard pattern:
  `Promise<void>` return type, `if (!errors.isEmpty()) { res.status(400)...; return; }`,
  try/catch returning `res.status(500).json({ error: err.message })`.
- `services/*.service.ts` — all business logic + Prisma access. Multi-write operations
  use `prisma.$transaction`. The Prisma client is a singleton from `config/database`.

### Auth & roles
- `middleware/auth.middleware.ts` → `authenticate` (verifies JWT, attaches `req.user`),
  `requirePermission(name)` (granular perms in the JWT payload; admin/super_admin bypass),
  and `requireMinRole`.
- Role hierarchy: `super_admin` (3) > `admin` (2) > `user` (1). Note there are **two**
  `requireMinRole` implementations (one in `auth.middleware.ts`, one in
  `roleHierarchy.middleware.ts`); routes import from either. `roleHierarchy.middleware.ts`
  also exports `canManageRole` / `canCreateRole` / `getManagedRoles`.
- Protect a whole router with `router.use(authenticate, requireMinRole('super_admin'))`.

### Timezone (critical)
`server.ts` sets `process.env.TZ = 'America/Bogota'` as its very first line, before any
import. All date logic assumes Bogotá (UTC-5). Shared date helpers live in
`shared/utils/dates.ts` (`todayBogota`, `parseISO`, `isOverdueBogota`, `formatDate`) —
reuse these instead of hand-rolling date math; YYYY-MM-DD strings must be parsed as local
day-start to avoid UTC off-by-one bugs.

**Frontend date rules** — violations cause silent off-by-one bugs:
- `new Date(year, month, day)` or `new Date("YYYY-MM-DD")` constructs a local/UTC
  midnight Date. **Never** serialize it with `.toISOString().slice(0,10)` — use
  `toLocalDateString(d)` from `frontend/src/utils/dates.ts` instead (uses local
  `getFullYear/getMonth/getDate`).
- `new Date("YYYY-MM-DD")` alone (no time) is **UTC midnight** per spec — in Bogotá
  (UTC-5) that's 19:00 the previous day. For date-range filters always use explicit
  offset: `new Date(\`${dateStr}T00:00:00.000-05:00\`)` / `T23:59:59.999-05:00`.
- `.toISOString()` on a Date sourced from the API (ISO timestamp) is safe — it's
  always UTC and timezone-neutral.
- `parseLocalDate(str)` in `frontend/src/utils/dates.ts` parses a YYYY-MM-DD string
  as local midnight (safe for display, not for API filter ranges — use explicit
  `-05:00` offset for those).

## Frontend architecture
React 18 + Vite + TypeScript, Tailwind. State: **Zustand** for auth/business
(`store/authStore.ts`, `store/businessStore.ts`), **TanStack Query** for all server state.
- `lib/axios.ts` — axios instance with `baseURL '/api'`. Request interceptor adds the JWT
  from `localStorage`; response interceptor auto-refreshes on 401 (one retry) and redirects
  to `/login` on failure.
- `api/*.api.ts` — one module per backend domain.
- Routing in `App.tsx`: `ProtectedRoute` (auth gate) wraps `DashboardLayout` with nested
  routes; `SuperAdminRoute` further restricts `/businesses` and `/billing` to `super_admin`
  (redirects others to `/dashboard`). Mirror any backend `super_admin` route restriction
  here AND hide the link in `components/common/Sidebar.tsx`.
- **`utils/invalidate.ts` → `invalidateMoney(qc)`**: query keys are fragmented (e.g.
  `credits` vs `credits-dashboard`), and `invalidateQueries` only prefix-matches. After ANY
  money-moving mutation (payment, transfer, inject/withdraw, tithe, new credit, billing
  revert, etc.) call `invalidateMoney(qc)` so the whole UI updates without a reload. Add new
  money-related query keys to its `MONEY_KEYS` list.
- No toast library — user feedback uses `window.confirm`, `alert`, and inline `setError`/
  banner state (see `pages/CashPage.tsx`, `pages/BillingPage.tsx`).
- PDFs are generated client-side with jsPDF (`utils/generate*Pdf.ts`); jsPDF does not
  auto-paginate, so these files implement manual page breaks.

## Domain model (`backend/prisma/schema.prisma`)
Core entities and how money flows:
- `Business` ⟶ `UserBusiness` (user↔business assignment), `Client`, `PaymentAccount`
  (cash buckets per business, e.g. "Efectivo", "Nequi"; auto-created on business creation).
- `Credit` (a loan) → `PaymentSchedule[]` (installments) + `Payment[]`. `PaymentFrequency`:
  daily/weekly/bisemanal/quincenal/monthly. `CreditStatus`: active/paid/overdue/cancelled.
- `Payment.scheduleId` links a payment to the installment it covers; `Payment.accountId`
  to the cash account. Overpayments either roll to the next installment or are "donated"
  (immediate profit → `CashMovement` of type `interest_earned`).
- `CashMovement` (`CashMovementType`: payment_received, capital_injection,
  initial_capital, internal_transfer, withdrawal, interest_earned, tithe, …) is the cash
  ledger; every account balance is reconstructed from these.
- `CashClose` — per-business daily close (snapshot of account balances). Once a day is
  closed, payments/movements for that day are blocked unless a `super_admin` reopens it.
- `TithePayment` (`/tithe`, super_admin only) — 10% on realized profit of paid credits,
  deducted from cash; credits carry `tithePaid`/`tithePaymentId`.
- `BusinessBilling` (`/billing`, super_admin only) — charges each business per credit
  created in a period. `Credit.billingId` (FK, `onDelete: SetNull`) marks a credit as
  already billed so it never gets re-counted; deleting a `BusinessBilling` automatically
  frees its credits (sets `billingId = null`) so they can be re-billed.
- `AuditLog` records actions; `EmailReminder` tracks payment-reminder emails.

Money is stored as Prisma `Decimal` — convert with `Number(...)` at the boundary and be
deliberate about rounding (the UI uses `Math.ceil` for COP display).

## Conventions
- Commit messages end with a `Co-Authored-By` trailer; commit/push only when asked, and
  the project ships by pushing to `main`.
- New code is Spanish-first in UI strings and comments, matching the existing codebase.

## Mapa de arquitectura
El mapa de módulos y funciones (ubicación, propósito, dependencias) vive en
**`ARCHITECTURE.md`** (raíz) — es la **fuente de verdad** para navegar el código. Los
agentes lo consultan antes de buscar a ciegas. Tras cambios estructurales (nuevos
módulos/servicios/rutas/modelos), refréscalo con el comando **`/map`** (agente
`architecture-keeper`).

## Flujo de trabajo (multiagente)
- Usa **plan mode** antes de cambios no triviales.
- Tras modificar código, **delega en `code-reviewer`** (proactivo) antes de cerrar.
- **Verifica antes de cerrar**: `npx tsc --noEmit` en cada paquete tocado (+ `npm run
  lint`, y `npm test` en backend cuando aplique). Es el chequeo estándar del proyecto.
- Refresca `ARCHITECTURE.md` con `/map` tras cambios estructurales.

### Se corre en la terminal del usuario (NO se delega a agentes)
- **Servidores dev**: `npm run dev` (backend :3000, frontend :5173) — procesos vivos
  de larga duración. Los agentes NO los levantan; verifican con `tsc --noEmit`,
  `npm run build`, lint y tests.
- **`npx prisma db push`** (schema → Supabase, DB de producción): cambio de schema =
  humano en el lazo. Dentro del arnés solo se edita `schema.prisma` y se corre
  `npx prisma generate` (codegen local).

## No tocar (seguridad)
- **Nunca** leas ni expongas `.env` (`backend/.env`, `frontend/.env`) ni ningún secreto
  (claves, tokens, `CRON_SECRET`, URLs de DB). Trabaja con nombres de variables.
- **No commitees credenciales.** Trata `login_response.json` y `users.json` (raíz) como
  archivos sensibles; no deben subir a git.
- No exfiltres secretos: la red está restringida por sandbox (ver abajo).

## Sandbox (aislamiento)
`.claude/settings.json` activa el sandbox de bash (`enabled`, `failIfUnavailable`,
`allowUnsandboxedCommands:false` → fail-closed). La red sale **solo** a
`sandbox.network.allowedDomains` (Anthropic, npm, GitHub, `binaries.prisma.sh`); todo
lo demás falla a nivel de red. `filesystem.denyRead` bloquea que bash lea credenciales
del SO (`~/.ssh`, `~/.aws`, `~/.config/gh`, `~/.gnupg`, `~/.netrc`) y los JSON sensibles.
El `.env` de la app SÍ es legible por bash (lo necesita `prisma generate`/la app) pero
no puede exfiltrarse (red) ni leerse con la tool Read (`permissions.deny`). Si un comando
legítimo falla por la restricción de red, evalúa la allowlist o `excludedCommands`
(esto último **debilita** el aislamiento — usar con criterio).

## Equipo de agentes (`.claude/agents/`)
| Agente | Cuándo delegar |
|---|---|
| `code-reader` | Localizar dónde vive algo / resumir código (solo lectura) |
| `developer` | Implementar el cambio según el plan aprobado |
| `database` | Esquema Prisma, queries, optimización (`prisma generate`, no `db push`) |
| `code-reviewer` | **Proactivo** tras cambios: bugs, calidad, impacto (solo lectura) |
| `qa` | Diseñar/correr tests (escribe solo archivos de test) |
| `security` | Auditoría de seguridad + dependencias/supply-chain (solo lectura) |
| `devops` | CI/CD, build, Vercel, entornos; fase de release |
| `architecture-keeper` | Mantener `ARCHITECTURE.md` (`/map`) |

La sesión principal (`opusplan`) es el **orquestador**: planifica y delega; no hay
archivo de agente para ella.
