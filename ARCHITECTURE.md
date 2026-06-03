# ARCHITECTURE.md

Mapa de módulos y funciones de **GestiónCrediFácil** — fuente de verdad para los
agentes. Mantenido por el agente `architecture-keeper` (comando `/map`). Documenta
solo lo que existe hoy en el código; actualizar de forma incremental.

> Stack: monorepo TypeScript. Backend Node/Express + Prisma (`backend/`), Frontend
> React 18 + Vite (`frontend/`), utilidades compartidas (`shared/`). npm por paquete.
> Detalle de comandos, convenciones y reglas de fecha/zona horaria en `CLAUDE.md`.

---

## Backend (`backend/src`)

Flujo estricto por dominio: **`routes/*.routes.ts` → `controllers/*.controller.ts` →
`services/*.service.ts` → Prisma**. Montado en `server.ts` bajo `/api/<dominio>`.
Toda la lógica de negocio y el acceso a Prisma viven en los **services**.

### Infraestructura
| Área | Archivo | Propósito |
|---|---|---|
| Entrada | `server.ts` | Fija `TZ=America/Bogota` (1ª línea), middlewares, monta routers, serverless en Vercel |
| DB | `config/database.ts` | Singleton del cliente Prisma |
| Env | `config/env.ts` | Lectura/validación de variables de entorno |
| Cron | `cron/` | Cierre automático de caja (pega a `/api/accounts/closes/auto-run`, 23:59 Bogotá) |
| Scripts | `scripts/` | Tareas puntuales (p. ej. `backfillAccountIds.ts`) |

### Middleware (`middleware/`)
| Archivo | Propósito |
|---|---|
| `auth.middleware.ts` | `authenticate` (verifica JWT → `req.user.userId`), `requirePermission`, `requireMinRole` |
| `roleHierarchy.middleware.ts` | `requireMinRole` (2ª impl.), `canManageRole`, `canCreateRole`, `getManagedRoles` |
| `validation.middleware.ts` | Manejo de resultados de express-validator |
| `rateLimiter.middleware.ts` | Límite de tasa (express-rate-limit) |
| `errorHandler.middleware.ts` | Manejador central de errores |

### Dominios (service ↔ controller ↔ route)
Cada dominio tiene típicamente los tres archivos homónimos. Resumen por dominio:

| Dominio | Service | Propósito |
|---|---|---|
| auth | `auth.service.ts` | Login, JWT (firma `userId`), reset de contraseña, bloqueo brute-force |
| user | `user.service.ts` | CRUD de usuarios, roles y permisos granulares |
| business | `business.service.ts` | Negocios; al crear, auto-crea `PaymentAccount`s |
| client | `client.service.ts` | Clientes por negocio, referidos |
| credit | `credit.service.ts` | Créditos + `PaymentSchedule[]`; estados; cálculo de interés/plazo |
| payment | `payment.service.ts` | Pagos sobre cuotas; sobrepago (rollover o donación → `interest_earned`) |
| account | `account.service.ts` | Cuentas de pago (buckets de efectivo) por negocio |
| cash | `cash.service.ts` | `CashMovement` (libro mayor), `CashClose` (cierre diario), transferencias |
| dashboard | `dashboard.service.ts` | Agregados/KPIs, próximos vencimientos, top deudores |
| billing | `billing.service.ts` | `BusinessBilling`: cobro por crédito creado en un período (super_admin) |
| tithe | `tithe.service.ts` | `TithePayment`: 10% sobre utilidad realizada (super_admin) |
| audit | `audit.service.ts` | `AuditLog`; export a Excel (exceljs) |
| whatsapp | `whatsapp.service.ts` | Integración WhatsApp (recordatorios/mensajes) |

Rutas extra sin service propio: `setup.routes.ts` (bootstrap inicial).

### Utilidades compartidas
| Archivo | Funciones clave | Propósito |
|---|---|---|
| `shared/utils/dates.ts` | `todayBogota`, `parseISO`, `isOverdueBogota`, `formatDate` | Fechas en zona Bogotá (UTC-5); evitar off-by-one |
| `backend/src/utils/`, `validators/`, `types/` | — | Helpers, cadenas de express-validator, tipos compartidos |

---

## Frontend (`frontend/src`)

React 18 + Vite + Tailwind. Estado: **Zustand** (auth/negocio) + **TanStack Query**
(estado de servidor). Rutas en `App.tsx` (`ProtectedRoute`, `SuperAdminRoute`).

### Infraestructura
| Área | Archivo | Propósito |
|---|---|---|
| Entrada | `main.tsx`, `App.tsx` | Bootstrap, providers, routing y guards |
| HTTP | `lib/axios.ts` | Axios `baseURL '/api'`; interceptor agrega JWT; auto-refresh en 401 |
| Estado auth | `store/authStore.ts` | Sesión/usuario (Zustand) |
| Estado negocio | `store/businessStore.ts` | Negocio activo (Zustand) |
| Layouts/rutas | `layouts/`, `routes/`, `hooks/`, `features/` | Estructura de UI y lógica reutilizable |

### API por dominio (`api/*.api.ts`)
Un módulo por dominio backend: `accounts`, `audit`, `auth` (`auth.ts`), `billing`,
`business`, `cash`, `clients`, `credits`, `dashboard`, `payments`, `tithe`, `users`,
`whatsapp`. Cada uno envuelve los endpoints `/api/<dominio>`.

### Páginas (`pages/`)
`LoginPage`, `DashboardHome`, `BusinessPage`, `ClientsPage`, `CreditsPage`,
`CreditDetailPage`, `PaymentsPage`, `CashPage`, `BillingPage`, `TithePage`,
`SettingsPage`, `WhatsAppPage`. (`BillingPage`/`TithePage` solo super_admin.)

### Utilidades (`utils/`)
| Archivo | Propósito |
|---|---|
| `dates.ts` | `parseLocalDate`, `toLocalDateString`, `normalizeToNoon`, `todayBogota`, `formatDate`… — fechas TZ-safe (ver reglas en `CLAUDE.md`) |
| `invalidate.ts` | `invalidateMoney(qc)` — invalida todas las query keys de dinero tras una mutación |
| `exportCsv.ts` | Export a CSV |
| `generateBillingPdf.ts`, `generateCloseReportPdf.ts`, `generateReceipt.ts` | PDFs client-side con jsPDF (paginación manual) |

### Componentes (`components/`)
Por dominio: `auth`, `business`, `cash`, `clients`, `common` (incl. `Sidebar`),
`credits`, `dashboard` (incl. `ColombianCalendar`, `ProximosVencimientos`,
`TopDeudores`), `payments`, `settings`.

---

## Modelo de datos (`backend/prisma/schema.prisma`)
Entidades núcleo y flujo de dinero:
`Business → UserBusiness / Client / PaymentAccount`;
`Credit → PaymentSchedule[] + Payment[]`; `CashMovement` (libro mayor del que se
reconstruye todo balance); `CashClose` (cierre diario); `TithePayment` (diezmo);
`BusinessBilling` (cobro por crédito, `Credit.billingId` con `onDelete: SetNull`);
`AuditLog`, `EmailReminder`. Dinero como `Decimal` (convertir con `Number(...)`).
Cambios de schema vía `npx prisma db push` (NO migrate) — lo corre el usuario.
