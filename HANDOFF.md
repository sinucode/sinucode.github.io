# Handoff — GestionCrediFacil (traspaso de contexto)

App de gestión de créditos ("gota a gota"/microcrédito) para Colombia.
Stack: **Backend** Node/Express + Prisma + Supabase (PostgreSQL, región aws us-west-2).
**Frontend** React + Vite + TanStack Query + Tailwind. Deploy en **Vercel** (región pdx1).
Repo: github.com/sinucode/sinucode.github.io · rama `main`.
URL: https://sinucode-github-io.vercel.app

## Datos clave
- Super admin: `admin@wsm.com` (id `d89e4a01-d642-40a8-bb56-cc02fee4ee71`)
- Negocios: Creditosfacil, MUSKUS, PruebaWil, **Demo Clientes** (nuevo, para mostrar a compradores)
- Migraciones: el proyecto usa **`prisma db push`** (NO migraciones versionadas)
- Conexión: DATABASE_URL puerto 6543 (pgbouncer) + DIRECT_URL 5432

## Lo hecho en esta sesión (todo commiteado y desplegado)

### Bugs corregidos
- Doble registro de `interest_earned` al cerrar crédito con sobrepago/donación
- `deleteCredit` bloqueado si el crédito tiene pagos (evita inflar caja)
- `revertInstallment` calcula estado overdue correctamente
- `normalizeToNoon(null)` devuelve hoy a mediodía Bogotá
- `next_cuota` ahora cascadea el excedente por varias cuotas (no descuadra)
- Fix raw SQL con cast `::uuid` (la columna es text) en cierre de crédito
- Frontend: muestra TODOS los pagos (abonos parciales ya no se ocultaban)
- Dashboard "cartera vencida" suma solo cuotas vencidas, no el saldo completo

### Features nuevas
- **Modal de excedente al pagar**: al sobrepagar una cuota pregunta "abonar a
  siguiente cuota" o "donar al negocio" (donación = ganancia inmediata, crea
  movimiento `interest_earned`)
- **Vínculo pago→cuota**: nueva columna `payments.scheduleId` (FK). Editor de
  schedule blindado (no permite descuadrar la suma vs total). Columna "Cuota"
  en detalle de crédito.
- **Página `/payments` rediseñada**: tabla accionable (cliente, tipo badge,
  cobrador), acciones (ver crédito, recibo PDF, WhatsApp, revertir), export CSV,
  recibos masivos, búsqueda y filtros.
- **Módulo Diezmo `/tithe`** (solo super_admin): calcula 10% sobre rentabilidad
  de créditos pagados por negocio, selección múltiple, descuenta de caja, marca
  pagado/pendiente. Modelos: `TithePayment`, campos `tithePaid/tithePaidAt`,
  enum CashMovementType `tithe`.
- **Selector de unidad de plazo** (Semanas/Meses) al crear crédito + frecuencia
  **Mensual por defecto**. Resuelve confusión de "1.5 meses".

### Performance DB
- Índices agregados en FKs (payments, payment_schedule, credits, cash_movements)
  — antes solo PK, hacían full scan. Verificado con EXPLAIN.
- `registerPayment`: escrituras finales en `Promise.all` (menos round-trips),
  timeout de transacción a 20s.
- vercel.json: `regions: ["pdx1"]` (misma región que Supabase).

### Reconciliaciones de datos (en audit_log)
- Eliminados 10 movimientos `interest_earned` duplicados (Bug #1, $187.115)
- PruebaWil: balance corregido −$1.000.000 (crédito eliminado con pagos previos)
- 11 créditos PAID + 6 activos con schedule descuadrado → reparados
- Antoni (0d929c45) y Luis (0edebc79): schedule cuadrado, pagos vinculados.
  Luis: saldo corregido $732.750 → $671.500 (pago perdido acreditado)
- Kare reactivado (pagó $330k de $420k, saldo $90k)
- Caja de PruebaWil llevada a $0 (con movimiento de ajuste)

### Demo creada
"Demo Clientes": 10 clientes, 10 créditos (3 pagados, 4 activos, 3 en mora),
caja $18.558.000. Para rentabilidad/diezmo: 3 pagados, rent. $783.000 → diezmo $78.300.

## Discusión de pricing (sin implementar)
Recomendación: **valor mensual fijo escalonado por rangos de clientes**
(no per-cliente puro — riesgo de que escondan deudores en efectivo informal):
- Hasta 30 clientes: $59.000/mes · 31–100: $129.000 · 101–300: $249.000 · 300+: a medida
- Bot WhatsApp solo desde el 2º escalón (palanca premium)
- Anual con 2 meses gratis, prueba 14 días

## Pendientes / ideas propuestas (no hechas)
- Construir lógica de planes en la app: contador de clientes activos por negocio,
  página de precios, aviso de upsell al acercarse al límite
- Backfill de scheduleId en los 290 pagos históricos (se decidió solo nuevos)
- Confirmar que Vercel Hobby respeta región pdx1 (si sigue lento → migrar a Render)
- Opcional: diezmo sobre interés neto vs rentabilidad bruta (hoy es bruta = cobrado − capital)

## Race conditions / idempotencia (identificados, no resueltos)
- Pagos concurrentes sin row-lock; sin idempotencyKey; cron WhatsApp sin dedup
- Business access control entre admins (getBusinessById no valida propiedad)

---
## ESTADO ACTUAL (cuentas + cierre)

### Sprint 1 COMPLETO y desplegado (commits 72587ac, c7b5db6, 756ca24)
- PaymentAccount (cuentas por negocio) + accountId en Payment/CashMovement.
- account.service.ts: listAccounts, getBalances (reconcilia residual del capital inicial en cuenta default), createAccount, updateAccount, deleteAccount (transfer/withdraw).
- /api/accounts (CRUD, requireMinRole user + validateAccess).
- cash.service: inject/withdraw/transfer con accountId; getCashFlow devuelve balances.accounts. registerPayment con accountId.
- business.createBusiness auto-crea "Efectivo".
- Frontend: Settings tab "Cuentas" (AccountsManagement.tsx), PaymentModal selector de cuenta, CashPage tarjetas por cuenta + Operations/TransferModal con cuentas reales.
- Helper frontend/src/utils/invalidate.ts (invalidateMoney) conectado en TODAS las mutaciones → UI se actualiza sin recargar.
- Backfill hecho: 0 movimientos/pagos sin cuenta; saldos cuadran.

### Sprint 2 COMPLETO y desplegado (commit 747ab8c)
- CashClose (status closed/reopened, mode manual/auto, snapshot accountBalances JSON, unique negocio+dia). db push aplicado.
- account.service: assertDayOpen, createClose (admin/super, upsert por dia), reopenClose (solo super_admin), autoCloseAll (cron), listCloses, getTodayClose.
- Bloqueo de dia cerrado en registerPayment + cash.service recordMovement/createInternalTransfer.
- Rutas /api/accounts/closes: GET today, GET lista, POST cerrar (admin), POST :id/reopen (super), GET/POST closes/auto-run (CRON_SECRET via header x-cron-secret o Authorization Bearer).
- vercel.json cron "59 4 * * *" (UTC=23:59 Bogota).
- Frontend: CashPage pestana "Cierre" (components/cash/CashCloseTab.tsx): estado hoy, Cerrar caja, saldo por cuenta, historial, Reabrir (solo super).
- PENDIENTE DEPLOY: agregar env CRON_SECRET en Vercel para el cron automatico.

### Sprint 3 COMPLETO (commit por confirmar)
- Backend: `getCloseReport(businessId, dateStr, userId, role)` en account.service — calcula apertura/ingresos/egresos/esperado por cuenta, tabla de pagos (hora/cliente/cuota/monto/cuenta/cobrador), tabla de operaciones (todos los movimientos excepto payment_received), KPIs totales. Ruta GET `/api/accounts/closes/report?businessId=&date=YYYY-MM-DD`.
- Frontend: tipos `CloseReport` en accounts.api.ts; `utils/generateCloseReportPdf.ts` (jsPDF A4 con header, KPIs, tabla de cuentas, pagos, operaciones, pie de página multi-hoja); `CashCloseTab.tsx` completamente rehecho: selector de fecha (default hoy Bogotá), badge estado, acciones hoy (cerrar/reabrir), 4 KPI cards, tabla saldo por cuenta (apertura/ingresos/egresos/esperado/contado/diferencia), tabla pagos del día, operaciones colapsables, botones Descargar PDF + Excel (CSV multi-sección BOM), historial colapsable con clic para cambiar fecha.
- invalidateMoney ahora invalida también close-today, close-history y close-report.
- El historial es colapsable y al hacer clic en una fila carga el reporte de ese día.
