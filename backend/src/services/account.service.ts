import { Prisma, UserRole, CashMovementType } from '@prisma/client';
import prisma from '../config/database';

export interface AccountBalance {
    id: string;
    name: string;
    type: string;
    isDefault: boolean;
    balance: number;
}

export class AccountService {
    /** Valida que el usuario tenga acceso al negocio (mismo patrón que cash.service) */
    private async validateAccess(businessId: string, userId: string, role: UserRole): Promise<void> {
        if (role === 'super_admin' || role === 'admin') return;
        const ub = await prisma.userBusiness.findFirst({ where: { userId, businessId }, select: { businessId: true } });
        if (!ub) throw new Error('No tiene permisos para acceder a los datos de este negocio');
    }

    /** Efecto firmado de un movimiento sobre el saldo (+ ingreso, − egreso). */
    private signedEffect(type: CashMovementType, amount: number): number {
        if (type === 'internal_transfer') return amount; // ya viene con signo
        const income: CashMovementType[] = [
            'payment_received', 'capital_injection', 'interest_earned',
            'initial_capital', 'credit_cancellation',
        ];
        return income.includes(type) ? Math.abs(amount) : -Math.abs(amount);
    }

    /** Asegura que el negocio tenga una cuenta "Efectivo" por defecto. Devuelve su id. */
    async ensureDefaultAccount(businessId: string, createdById: string): Promise<string> {
        const existing = await prisma.paymentAccount.findFirst({
            where: { businessId, isDefault: true, active: true },
            select: { id: true },
        });
        if (existing) return existing.id;
        const acc = await prisma.paymentAccount.create({
            data: { businessId, name: 'Efectivo', type: 'cash', isDefault: true, createdById },
        });
        return acc.id;
    }

    async listAccounts(businessId: string, userId: string, role: UserRole) {
        await this.validateAccess(businessId, userId, role);
        return prisma.paymentAccount.findMany({
            where: { businessId, active: true },
            orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
        });
    }

    /** Saldo por cuenta. Reconcilia el residual con el saldo real del negocio en la cuenta por defecto. */
    async getBalances(businessId: string, userId: string, role: UserRole): Promise<{ accounts: AccountBalance[]; total: number }> {
        await this.validateAccess(businessId, userId, role);

        const [accounts, business, movements] = await Promise.all([
            prisma.paymentAccount.findMany({ where: { businessId, active: true }, orderBy: [{ isDefault: 'desc' }, { name: 'asc' }] }),
            prisma.business.findUnique({ where: { id: businessId }, select: { currentBalance: true } }),
            prisma.cashMovement.findMany({ where: { businessId }, select: { type: true, amount: true, accountId: true } }),
        ]);
        if (!business) throw new Error('Negocio no encontrado');

        const defaultAcc = accounts.find(a => a.isDefault) || accounts[0];
        const balByAcc: Record<string, number> = {};
        accounts.forEach(a => { balByAcc[a.id] = 0; });

        for (const mov of movements) {
            const eff = this.signedEffect(mov.type, Number(mov.amount));
            // Movimientos sin cuenta (legacy) caen en la cuenta por defecto
            const accId = mov.accountId && balByAcc[mov.accountId] !== undefined ? mov.accountId : defaultAcc?.id;
            if (accId) balByAcc[accId] = (balByAcc[accId] || 0) + eff;
        }

        // Reconciliar residual con el saldo real del negocio (cuadra siempre el total)
        const declaredTotal = Number(business.currentBalance);
        const calc = Object.values(balByAcc).reduce((s, v) => s + v, 0);
        if (Math.abs(declaredTotal - calc) > 0.01 && defaultAcc) {
            balByAcc[defaultAcc.id] += declaredTotal - calc;
        }

        const result: AccountBalance[] = accounts.map(a => ({
            id: a.id, name: a.name, type: a.type, isDefault: a.isDefault,
            balance: Math.round((balByAcc[a.id] || 0) * 100) / 100,
        }));
        return { accounts: result, total: declaredTotal };
    }

    async createAccount(businessId: string, name: string, type: string, userId: string, role: UserRole) {
        await this.validateAccess(businessId, userId, role);
        const clean = name.trim();
        if (!clean) throw new Error('El nombre de la cuenta es requerido');
        const dup = await prisma.paymentAccount.findFirst({ where: { businessId, name: clean } });
        if (dup) {
            if (dup.active) throw new Error('Ya existe una cuenta con ese nombre');
            // Reactivar una cuenta borrada con el mismo nombre
            return prisma.paymentAccount.update({ where: { id: dup.id }, data: { active: true, type } });
        }
        const acc = await prisma.paymentAccount.create({
            data: { businessId, name: clean, type: type || 'bank', createdById: userId },
        });
        await prisma.auditLog.create({
            data: { userId, businessId, action: 'CREATE_ACCOUNT', description: `Creó la cuenta '${clean}'`, entityType: 'PaymentAccount', entityId: acc.id },
        }).catch(() => { });
        return acc;
    }

    async updateAccount(accountId: string, data: { name?: string; type?: string }, userId: string, role: UserRole) {
        const acc = await prisma.paymentAccount.findUnique({ where: { id: accountId } });
        if (!acc) throw new Error('Cuenta no encontrada');
        await this.validateAccess(acc.businessId, userId, role);
        if (data.name) {
            const clean = data.name.trim();
            const dup = await prisma.paymentAccount.findFirst({ where: { businessId: acc.businessId, name: clean, id: { not: accountId } } });
            if (dup) throw new Error('Ya existe una cuenta con ese nombre');
        }
        return prisma.paymentAccount.update({
            where: { id: accountId },
            data: { ...(data.name && { name: data.name.trim() }), ...(data.type && { type: data.type }) },
        });
    }

    /** Elimina (soft) una cuenta. Si tiene saldo, exige transferir a otra o retirar del negocio. */
    async deleteAccount(accountId: string, opts: { mode?: 'transfer' | 'withdraw'; targetAccountId?: string }, userId: string, role: UserRole) {
        const acc = await prisma.paymentAccount.findUnique({ where: { id: accountId } });
        if (!acc) throw new Error('Cuenta no encontrada');
        await this.validateAccess(acc.businessId, userId, role);

        const activeCount = await prisma.paymentAccount.count({ where: { businessId: acc.businessId, active: true } });
        if (activeCount <= 1) throw new Error('No puedes eliminar la única cuenta del negocio');

        const { accounts } = await this.getBalances(acc.businessId, userId, role);
        const saldo = accounts.find(a => a.id === accountId)?.balance || 0;

        return prisma.$transaction(async (tx) => {
            if (Math.abs(saldo) > 0.01) {
                if (!opts.mode) throw new Error(`La cuenta tiene saldo de $${saldo.toLocaleString('es-CO')}. Indica si transferir a otra cuenta o retirar del negocio.`);

                if (opts.mode === 'transfer') {
                    if (!opts.targetAccountId || opts.targetAccountId === accountId) throw new Error('Selecciona una cuenta destino válida');
                    const target = await tx.paymentAccount.findFirst({ where: { id: opts.targetAccountId, businessId: acc.businessId, active: true } });
                    if (!target) throw new Error('Cuenta destino no válida');
                    // Transferencia interna: no cambia el total del negocio
                    await tx.cashMovement.create({ data: { businessId: acc.businessId, type: 'internal_transfer', amount: new Prisma.Decimal(-saldo), balanceAfter: new Prisma.Decimal(0), description: `Cierre de cuenta '${acc.name}' → '${target.name}'`, accountId, paymentMethod: acc.name, createdById: userId } });
                    await tx.cashMovement.create({ data: { businessId: acc.businessId, type: 'internal_transfer', amount: new Prisma.Decimal(saldo), balanceAfter: new Prisma.Decimal(0), description: `Ingreso por cierre de cuenta '${acc.name}'`, accountId: target.id, paymentMethod: target.name, createdById: userId } });
                } else {
                    // Retiro: reduce el total del negocio
                    const biz = await tx.business.findUnique({ where: { id: acc.businessId }, select: { currentBalance: true } });
                    const newBal = new Prisma.Decimal(Number(biz!.currentBalance)).minus(saldo);
                    await tx.cashMovement.create({ data: { businessId: acc.businessId, type: 'withdrawal', amount: new Prisma.Decimal(saldo), balanceAfter: newBal, description: `Retiro por cierre de cuenta '${acc.name}'`, accountId, paymentMethod: acc.name, createdById: userId } });
                    await tx.business.update({ where: { id: acc.businessId }, data: { currentBalance: newBal } });
                }
            }

            await tx.paymentAccount.update({ where: { id: accountId }, data: { active: false } });
            await tx.auditLog.create({ data: { userId, businessId: acc.businessId, action: 'DELETE_ACCOUNT', description: `Eliminó la cuenta '${acc.name}' (saldo $${saldo.toLocaleString('es-CO')}, modo: ${saldo ? opts.mode : 'sin saldo'})`, entityType: 'PaymentAccount', entityId: accountId } });
            return { success: true, saldoResuelto: saldo };
        });
    }

    // ───────────────────────────── CIERRE DIARIO ─────────────────────────────

    /** Inicio del día (00:00 America/Bogota) para una fecha dada. */
    private dayStart(date: Date): Date {
        const dayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(date);
        return new Date(`${dayStr}T00:00:00.000-05:00`);
    }

    /** Lanza error si el día (de la fecha dada) está cerrado para el negocio. */
    async assertDayOpen(businessId: string, date: Date): Promise<void> {
        const start = this.dayStart(date);
        const end = new Date(start.getTime() + 24 * 3600 * 1000);
        const close = await prisma.cashClose.findFirst({
            where: { businessId, status: 'closed', closeDate: { gte: start, lt: end } },
            select: { id: true },
        });
        if (close) {
            const dayStr = new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
            throw new Error(`El día ${dayStr} está cerrado. Un super admin debe reabrir el cierre para registrar este movimiento.`);
        }
    }

    /** Cierre del día de hoy si existe (para mostrar estado). */
    async getTodayClose(businessId: string, userId: string, role: UserRole) {
        await this.validateAccess(businessId, userId, role);
        const start = this.dayStart(new Date());
        const end = new Date(start.getTime() + 24 * 3600 * 1000);
        return prisma.cashClose.findFirst({ where: { businessId, closeDate: { gte: start, lt: end } } });
    }

    /** Crea (o re-snapshot) el cierre del día. Admin/super. mode='manual'|'auto'. */
    async createClose(businessId: string, opts: { countedBalances?: Record<string, number>; notes?: string }, userId: string, role: UserRole, mode: 'manual' | 'auto' = 'manual') {
        if (mode === 'manual' && !['admin', 'super_admin'].includes(role)) throw new Error('Solo administradores pueden cerrar la caja');
        await this.validateAccess(businessId, userId, role);

        const { accounts, total } = await this.getBalances(businessId, userId, role);
        const closeDate = this.dayStart(new Date());
        const accountBalances = accounts.map(a => {
            const counted = opts.countedBalances?.[a.id];
            return {
                accountId: a.id, name: a.name, systemBalance: a.balance,
                countedBalance: counted ?? null,
                difference: counted != null ? Math.round((counted - a.balance) * 100) / 100 : null,
            };
        });

        return prisma.cashClose.upsert({
            where: { businessId_closeDate: { businessId, closeDate } },
            create: { businessId, closeDate, status: 'closed', closeMode: mode, totalBalance: new Prisma.Decimal(total), accountBalances: accountBalances as any, notes: opts.notes, closedById: userId },
            update: { status: 'closed', closeMode: mode, totalBalance: new Prisma.Decimal(total), accountBalances: accountBalances as any, notes: opts.notes, closedById: userId, closedAt: new Date(), reopenedById: null, reopenedAt: null, reopenReason: null },
        });
    }

    /** Reabre un cierre. Solo super_admin. */
    async reopenClose(closeId: string, reason: string, userId: string, role: UserRole) {
        if (role !== 'super_admin') throw new Error('Solo el Super Admin puede reabrir un cierre');
        const close = await prisma.cashClose.findUnique({ where: { id: closeId } });
        if (!close) throw new Error('Cierre no encontrado');
        const updated = await prisma.cashClose.update({
            where: { id: closeId },
            data: { status: 'reopened', reopenedById: userId, reopenedAt: new Date(), reopenReason: reason || null },
        });
        await prisma.auditLog.create({ data: { userId, businessId: close.businessId, action: 'REOPEN_CASH_CLOSE', description: `Reabrió el cierre del ${close.closeDate.toISOString().slice(0, 10)}. Motivo: ${reason || '—'}`, entityType: 'CashClose', entityId: closeId } }).catch(() => { });
        return updated;
    }

    async listCloses(businessId: string, userId: string, role: UserRole) {
        await this.validateAccess(businessId, userId, role);
        return prisma.cashClose.findMany({ where: { businessId }, orderBy: { closeDate: 'desc' }, take: 90 });
    }

    // ───────────────────────── REPORTE DE CIERRE ──────────────────────────

    /**
     * Genera el reporte de cierre para una fecha dada (YYYY-MM-DD).
     * Devuelve KPIs, saldo por cuenta, pagos del día y operaciones del día.
     */
    async getCloseReport(businessId: string, dateStr: string, userId: string, role: UserRole) {
        await this.validateAccess(businessId, userId, role);

        // Validar formato
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) throw new Error('Fecha inválida. Use YYYY-MM-DD');

        const dayStart = new Date(`${dateStr}T00:00:00.000-05:00`);
        const dayEnd   = new Date(`${dateStr}T23:59:59.999-05:00`);
        const nextDay  = new Date(dayStart.getTime() + 24 * 3600 * 1000);

        const [accounts, cashClose, preMovements, dayMovements, dayPayments, business] = await Promise.all([
            // Todas las cuentas (incluidas inactivas que pudieron tener movimientos)
            prisma.paymentAccount.findMany({
                where: { businessId },
                orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
            }),
            // Cierre del día (si existe)
            prisma.cashClose.findFirst({
                where: { businessId, closeDate: { gte: dayStart, lt: nextDay } },
            }),
            // Movimientos ANTES del día (para calcular apertura)
            prisma.cashMovement.findMany({
                where: { businessId, createdAt: { lt: dayStart } },
                select: { type: true, amount: true, accountId: true },
            }),
            // Movimientos DEL día
            prisma.cashMovement.findMany({
                where: { businessId, createdAt: { gte: dayStart, lte: dayEnd } },
                include: {
                    createdBy: { select: { fullName: true } },
                    account:   { select: { name: true } },
                },
                orderBy: { createdAt: 'asc' },
            }),
            // Pagos registrados DEL día
            prisma.payment.findMany({
                where: {
                    credit: { businessId },
                    createdAt: { gte: dayStart, lte: dayEnd },
                },
                include: {
                    credit: { include: { client: { select: { fullName: true } } } },
                    schedule:  { select: { installmentNumber: true } },
                    account:   { select: { name: true } },
                    createdBy: { select: { fullName: true } },
                },
                orderBy: { createdAt: 'asc' },
            }),
            prisma.business.findUnique({ where: { id: businessId }, select: { name: true } }),
        ]);

        const defaultAcc = accounts.find(a => a.isDefault) || accounts[0];
        const activeAccounts = accounts.filter(a => a.active);

        // ─── Cálculo de saldos por cuenta ───
        const aperturaByAcc: Record<string, number> = {};
        const ingresosByAcc: Record<string, number> = {};
        const egresosByAcc:  Record<string, number> = {};
        accounts.forEach(a => {
            aperturaByAcc[a.id] = 0;
            ingresosByAcc[a.id] = 0;
            egresosByAcc[a.id]  = 0;
        });

        // Apertura: suma de movimientos ANTES del día
        for (const mov of preMovements) {
            const eff = this.signedEffect(mov.type as CashMovementType, Number(mov.amount));
            const accId = (mov.accountId && aperturaByAcc[mov.accountId] !== undefined)
                ? mov.accountId : defaultAcc?.id;
            if (accId) aperturaByAcc[accId] = (aperturaByAcc[accId] || 0) + eff;
        }

        // Ingresos/Egresos del día
        for (const mov of dayMovements) {
            const eff = this.signedEffect(mov.type as CashMovementType, Number(mov.amount));
            const accId = (mov.accountId && ingresosByAcc[mov.accountId] !== undefined)
                ? mov.accountId : defaultAcc?.id;
            if (accId) {
                if (eff >= 0) ingresosByAcc[accId] = (ingresosByAcc[accId] || 0) + eff;
                else          egresosByAcc[accId]  = (egresosByAcc[accId]  || 0) + eff;
            }
        }

        // Tabla de cuentas
        const accountsTable = activeAccounts.map(a => {
            const apertura = Math.round((aperturaByAcc[a.id] || 0) * 100) / 100;
            const ingresos = Math.round((ingresosByAcc[a.id] || 0) * 100) / 100;
            const egresos  = Math.round((egresosByAcc[a.id]  || 0) * 100) / 100;
            const esperado = Math.round((apertura + ingresos + egresos) * 100) / 100;
            const snapshot = (cashClose?.accountBalances as any[] | null)
                ?.find((ab: any) => ab.accountId === a.id);
            return {
                accountId: a.id,
                name:      a.name,
                type:      a.type,
                apertura,
                ingresos,
                egresos,
                esperado,
                contado:    snapshot?.countedBalance   ?? null,
                diferencia: snapshot?.difference       ?? null,
            };
        });

        // Tabla de pagos
        const paymentsTable = dayPayments.map(p => ({
            id:            p.id,
            hora:          p.createdAt,
            clienteNombre: p.credit.client.fullName,
            creditId:      p.creditId,
            cuotaNumero:   p.schedule?.installmentNumber ?? null,
            monto:         Math.round(Number(p.amount) * 100) / 100,
            cuenta:        p.account?.name ?? '—',
            cobrador:      p.createdBy.fullName,
        }));

        // Tabla de operaciones (todo excepto payment_received — esos van en pagos)
        const operationsTable = dayMovements
            .filter(m => m.type !== 'payment_received')
            .map(m => ({
                id:           m.id,
                hora:         m.createdAt,
                tipo:         m.type as string,
                cuenta:       m.account?.name ?? '—',
                monto:        Math.round(Number(m.amount) * 100) / 100,
                efectoSignado: this.signedEffect(m.type as CashMovementType, Number(m.amount)),
                descripcion:  m.description || '',
                usuario:      m.createdBy.fullName,
            }));

        // Totales
        let totalIngresos = 0;
        let totalEgresos  = 0;
        for (const mov of dayMovements) {
            const eff = this.signedEffect(mov.type as CashMovementType, Number(mov.amount));
            if (eff >= 0) totalIngresos += eff;
            else          totalEgresos  += eff;
        }
        const totalCobrado = dayPayments.reduce((s, p) => s + Number(p.amount), 0);

        return {
            meta: {
                businessId,
                businessName: business?.name ?? '',
                date: dateStr,
                close: cashClose ? {
                    id:           cashClose.id,
                    status:       cashClose.status,
                    closeMode:    cashClose.closeMode,
                    closedAt:     cashClose.closedAt,
                    totalBalance: Number(cashClose.totalBalance),
                    notes:        cashClose.notes,
                } : null,
            },
            accounts: accountsTable,
            payments: paymentsTable,
            operations: operationsTable,
            totals: {
                totalCobrado:  Math.round(totalCobrado   * 100) / 100,
                numPagos:      dayPayments.length,
                totalIngresos: Math.round(totalIngresos  * 100) / 100,
                totalEgresos:  Math.round(Math.abs(totalEgresos) * 100) / 100,
                neto:          Math.round((totalIngresos + totalEgresos) * 100) / 100,
            },
        };
    }

    /** Cierre automático de todos los negocios con actividad del día y sin cierre. Para el cron. */
    async autoCloseAll() {
        const start = this.dayStart(new Date());
        const end = new Date(start.getTime() + 24 * 3600 * 1000);
        const businesses = await prisma.business.findMany({ select: { id: true, name: true, createdById: true } });
        let closed = 0;
        for (const b of businesses) {
            const already = await prisma.cashClose.findFirst({ where: { businessId: b.id, closeDate: { gte: start, lt: end } }, select: { id: true } });
            if (already) continue;
            const activity = await prisma.cashMovement.count({ where: { businessId: b.id, createdAt: { gte: start, lt: end } } });
            if (activity === 0) continue;
            try {
                await this.createClose(b.id, {}, b.createdById, 'super_admin', 'auto');
                closed++;
            } catch { /* continuar con los demás */ }
        }
        return { closed, total: businesses.length };
    }
}

export const accountService = new AccountService();
