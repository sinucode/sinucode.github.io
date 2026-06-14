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
| credit | `credit.service.ts` | Créditos + `PaymentSchedule[]`; estados; cálculo de interés/plazo; opciones de exclusión de días y redondeo; **pago cruzado** |
| payment | `payment.service.ts` | Pagos sobre cuotas; sobrepago (rollover o donación → `interest_earned`) |
| account | `account.service.ts` | Cuentas de pago (buckets de efectivo) por negocio |
| cash | `cash.service.ts` | `CashMovement` (libro mayor), `CashClose` (cierre diario), transferencias |
| dashboard | `dashboard.service.ts` | Agregados/KPIs, próximos vencimientos, top deudores |
| billing | `billing.service.ts` | `BusinessBilling`: cobro por crédito creado en un período (super_admin) |
| tithe | `tithe.service.ts` | `TithePayment`: 10% sobre utilidad realizada (super_admin) |
| audit | `audit.service.ts` | `AuditLog`; export a Excel (exceljs) |
| whatsapp | `whatsapp.service.ts` | Integración WhatsApp (recordatorios/mensajes) |

Rutas extra sin service propio: `setup.routes.ts` (bootstrap inicial).

### Servicios detallados

#### `credit.service.ts` — Métodos clave
- **`createCredit(data, userId, role, ipAddress)`**: Crea crédito + plan de pagos. Acepta:
  - `CreateCreditInput.financings?: { creditId, scheduleId?, amount, excessAction? }[]` — pago cruzado: redirige pagos reales de otros créditos del mismo negocio para financiar parte/todo del desembolso. `excessAction` ('next_cuota' | 'donate') indica cómo manejar el excedente si el monto supera la cuota/saldo.
  - Valida cada financing: fuente en mismo negocio, no pagada/cancelada. Sin `excessAction`, monto ≤ saldo pendiente; con `excessAction`, permite sobrepago que se procesa en `applyPaymentTx`.
  - Calcula `cashNeeded = amount - financedSum`; si > 0, valida saldo de caja y aplica desembolso; si = 0, financiamiento 100%.
  - Abre `$transaction` y ejecuta:
    1. `assertDayOpen(targetBusinessId, startDate)` (si hay financings).
    2. Revalidación TOCTOU de financings dentro de la tx (mitigación de race conditions).
    3. `applyPaymentTx(tx, {...})` por cada financing: registra Payment real + CashMovement `payment_received` sobre el crédito fuente, respetando `excessAction`.
    4. Crea `Credit` + `PaymentSchedule[]`.
    5. Crea `CashMovement` `loan_disbursement` para la parte financiada y para `cashNeeded`.
    6. Auditoría con array `financings` si aplica.
  - Usa `splits` opcional para distribuir `cashNeeded` entre varias cuentas.

- **`applyPaymentTx(tx, params)`** (privado): Cuerpo transaccional reutilizable de aplicación de pago. Debe invocarse **dentro de una `$transaction`** existente.
  - Parámetros: `{ creditId, amount, payDate, paymentMethod?, notes?, scheduleId?, accountId?, excessAction?, userId, role, ipAddress? }`
  - Localiza cuota (si viene `scheduleId`) o distribuye automáticamente entre cuotas pendientes.
  - Maneja sobrepago: `excessAction: 'next_cuota'` (cascada el excedente a cuotas siguientes) o `'donate'` (ganancia inmediata sin reducir saldo del crédito).
  - Crea `Payment` + `CashMovement` (`payment_received` y/o `interest_earned`).
  - Actualiza `remainingBalance`, estado del crédito (`active`/`paid`/`overdue`), cuotas.
  - Registra `AuditLog`.
  - **Contrato**: el llamador garantiza fecha no futura y día abierto (para `registerPayment`, antes de abrir la tx; para `createCredit`, al inicio).

- **`registerPayment(params)` → `Promise<Payment>`**: Registra un pago (ruta pública).
  - Valida fecha no futura, abre día, invoca `applyPaymentTx` dentro de su propia `$transaction`.
  - Soporta `excessAction` en el payload para pago directo (POST `/api/payments`).

- **`listCredits(userId, role, filters: ListFilters)`**: Lista créditos filtrados.
  - `ListFilters` incluye `clientId?: string` (nuevo); filtra por cliente específico si se envía.
  - Excluye cancelados por defecto (respeta `filters.status` si viene).

### Validadores (`validators/`)

#### `credit.validators.ts`
- **`createCreditValidators`**: Incluye cadenas para:
  - `financings` (array): `financings.*.creditId` (UUID), `financings.*.scheduleId` (UUID opcional), `financings.*.amount` (float > 0).
  - **`financings.*.excessAction`** (nuevo): opcional, validado como 'next_cuota' | 'donate'. Si presente, requiere que `scheduleId` esté especificado (error si no).
- **`listCreditValidators`**: Incluye `query('clientId')` (UUID opcional).

### Utilidades backend (`utils/`)
| Archivo | Funciones clave | Propósito |
|---|---|---|
| `dates.ts` | `todayBogota`, `parseISO`, `isOverdueBogota`, `formatDate` | Fechas en zona Bogotá (UTC-5); evitar off-by-one |
| `calculations.ts` | `calculateCreditPlan`, `calculateEndDate`, `roundUpInstallment`, `ScheduleOptions` | Cálculo de plan de pagos; soporte para exclusión de días y redondeo personalizado |
| `holidays.ts` | `getColombianHolidays`, `getHolidaySet`, `isHoliday` | Festivos colombianos (algorítmico): Pascua, Ley Emiliani, fijos. Usado por `calculations.ts` |
| `validators/`, `types/` | — | Helpers y cadenas de express-validator |

**Dependencias en `calculations.ts`**: usa `holidays.ts` (`getHolidaySet`, `isHoliday`) para
excluir festivos al avanzar fechas de vencimiento.

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

#### `credits.api.ts`
- **`SimulateCreditPayload`**: incluye `excludedWeekdays?`, `excludeHolidays?`, `customRounding?`
- **`CreateCreditPayload`** (extiende `SimulateCreditPayload`):
  - Nuevo campo: `financings?: { creditId: string; scheduleId?: string; amount: number; excessAction?: 'next_cuota' | 'donate' }[]`
  - `excessAction` es opcional en cada financing; indica cómo manejar el sobrepago (abonar a siguiente cuota vs. donar al negocio).
  - Incluye `splits?` para multi-cuenta.
- **`getCredits(params?)`**: Acepta `{ businessId?, status?, dueToday?, overdue?, clientId? }` — nuevo parámetro `clientId` para filtrar por cliente.

### Páginas (`pages/`)
`LoginPage`, `DashboardHome`, `BusinessPage`, `ClientsPage`, `CreditsPage`,
`CreditDetailPage`, `PaymentsPage`, `CashPage`, `BillingPage`, `TithePage`,
`SettingsPage`, `WhatsAppPage`. (`BillingPage`/`TithePage` solo super_admin.)

### Utilidades (`utils/`)
| Archivo | Propósito |
|---|---|
| `dates.ts` | `parseLocalDate`, `toLocalDateString`, `normalizeToNoon`, `todayBogota`, `formatDate`… — fechas TZ-safe (ver reglas en `CLAUDE.md`) |
| `holidays.ts` | `getColombianHolidays`, `getHolidaySet`, `isColombianHoliday` — mismo cálculo de festivos que backend para preview en UI |
| `invalidate.ts` | `invalidateMoney(qc)` — invalida todas las query keys de dinero tras una mutación |
| `exportCsv.ts` | Export a CSV |
| `generateBillingPdf.ts`, `generateCloseReportPdf.ts`, `generateReceipt.ts` | PDFs client-side con jsPDF (paginación manual) |

### Componentes (`components/`)
Por dominio: `auth`, `business`, `cash`, `clients`, `common` (incl. `Sidebar`),
`credits`, `dashboard` (incl. `ColombianCalendar`, `ProximosVencimientos`,
`TopDeudores`), `payments`, `settings`.

#### `CreditForm.tsx` (`credits/`)
- Usa `getHolidaySet` de `utils/holidays.ts` para preview de festivos.
- Estado: `excludedWeekdays`, `excludeHolidays`, `customRounding`, **`financingEnabled`, `financingRows`**.
- Botones **Fechas** (excluir días de semana) y **Personalizar** (redondeo) con paneles.
- Checkbox "Financiar el desembolso con pagos de otros clientes" activa la sección de financiamiento cruzado.
- Re-simula al cambiar opciones; incluye en payloads `simulateCredit` y `createCredit`.
- Calcula `cashNeeded = monto_crédito - sum(financings.amount)` para validar reparto multi-cuenta.
- Usa `ExcessChoiceModal` para solicitar acción cuando el monto en un financing supera la cuota/saldo.

#### `ExcessChoiceModal.tsx` (`credits/`)
- Componente reutilizable que muestra un modal cuando un pago/abono supera el monto pendiente de una cuota.
- Props: `{ open: boolean, cuotasConExceso: CuotaConExceso[], tieneCuotaSiguiente: boolean, isSubmitting?: boolean, onChoose: (action: 'next_cuota' | 'donate') => void, onCancel: () => void }`.
- Muestra detalle de cada cuota: número, monto pagado, monto pendiente, excedente.
- Ofrece dos opciones: "Abonar a la siguiente cuota" (si hay cuota pendiente) o "Donar al negocio" (ganancia).
- Usado por `PaymentModal.tsx` (pagos directos) y `CreditForm.tsx` (financiamiento cruzado).

#### `FinancingRowWidget` (subcomponente, en `CreditForm.tsx`)
- Props: `{ row: FinancingRow, clientList, excludeClientId, businessId, onChange, onRemove }`.
- `FinancingRow`: `{ id, clientId, clientName, creditId, scheduleId, amount, excessAction? }`.
- Encadena queries:
  1. `getCredits({ businessId, clientId: row.clientId })` → lista créditos activos/en mora del cliente.
  2. `getCreditDetail(row.creditId)` → carga plan de pagos.
  3. Filtra cuotas con saldo pendiente; calcula `pendingAmount` de la cuota seleccionada.
- UI: selects en cascada (cliente → crédito → cuota) + campo de monto con botones de acceso rápido (+10k, +50k, +100k) y "Todo pendiente".
- Botón X para remover la fila.

#### `PaymentModal.tsx` (`payments/`)
- Modal para registrar pagos directos sobre un crédito.
- Usa `ExcessChoiceModal` cuando el monto pagado supera la cuota seleccionada.
- Props incluyen `onSuccess`, que invalida money queries tras registrar el pago.

---

## Modelo de datos (`backend/prisma/schema.prisma`)
Entidades núcleo y flujo de dinero:
`Business → UserBusiness / Client / PaymentAccount`;
`Credit → PaymentSchedule[] + Payment[]`; `CashMovement` (libro mayor del que se
reconstruye todo balance); `CashClose` (cierre diario); `TithePayment` (diezmo);
`BusinessBilling` (cobro por crédito, `Credit.billingId` con `onDelete: SetNull`);
`AuditLog`, `EmailReminder`. Dinero como `Decimal` (convertir con `Number(...)`).
Cambios de schema vía `npx prisma db push` (NO migrate) — lo corre el usuario.

### Flujo de "pago cruzado al crear crédito"
1. Usuario elige cliente A para nuevo crédito (monto $X).
2. Activa checkbox "Financiar desembolso con pagos de otros clientes".
3. Añade filas: cliente B → crédito B → cuota N → monto $Y (donde Y ≤ X).
4. Opcionalmente especifica `excessAction` si el monto Y supera el saldo de cuota N.
5. **Backend** (`createCredit`):
   - Valida: cliente B activo, crédito B (active/overdue), cuota N existe y tiene saldo pendiente.
   - Calcula `cashNeeded = X - Y`.
   - Abre transacción y registra un `Payment` real sobre el crédito B (cuota N), aplicado a través de `applyPaymentTx`.
     - Si hay `excessAction`, procesa sobrepago: 'next_cuota' (cascada) o 'donate' (ganancia).
     - Genera `CashMovement` `payment_received` (+$Y o +$saldo en caja de B).
   - Crea crédito A con saldo $X.
   - Crea `CashMovement` `loan_disbursement` para $Y (financiado) y $cashNeeded (desde caja real).
   - Saldo neto: caja se reduce solo en `cashNeeded` (el abono al crédito fuente ya compensó).
6. **Auditoría**: `AuditLog.newValues.financings` contiene array de `{ creditId, clientName, scheduleId?, amount, excessAction? }`.

