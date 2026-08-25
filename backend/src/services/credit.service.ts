import { Prisma, UserRole } from '@prisma/client';
import prisma from '../config/database';
import { calculateCreditPlan, calculateEndDate } from '../utils/calculations';
import { normalizeToNoon } from '../utils/dates';
import { accountService } from './account.service';
import { getHolidayDatesFromDB } from './holiday.service';
import logger from '../utils/logger';
import { AppError } from '../utils/AppError';

export type PaymentFrequency = 'daily' | 'weekly' | 'bisemanal' | 'quincenal' | 'monthly';

interface CreateCreditInput {
    clientId: string;
    businessId?: string;
    amount: number;
    interestRate: number;
    termDays: number;
    frequency: PaymentFrequency;
    startDate?: string;
    accountId?: string;
    splits?: { accountId: string; amount: number }[];
    excludedWeekdays?: number[];
    excludeHolidays?: boolean;
    customRounding?: boolean;
    /** Financiamientos cruzados: cada entrada redirige un pago real de otro crédito
     *  para cubrir parte del desembolso de este crédito nuevo.
     *  Si el monto supera el pendiente de la cuota / saldo del crédito fuente,
     *  se requiere excessAction para indicar qué hacer con el excedente. */
    financings?: { creditId: string; scheduleId?: string; amount: number; excessAction?: 'next_cuota' | 'donate' }[];
}

interface ListFilters {
    businessId?: string;
    clientId?: string;
    status?: string;
    dueToday?: boolean;
    overdue?: boolean;
}

export class CreditService {
    private async getUserBusiness(userId: string): Promise<string | null> {
        const userBusiness = await prisma.userBusiness.findFirst({
            where: { userId },
            select: { businessId: true },
        });
        return userBusiness?.businessId || null;
    }

    private normalizeDate(dateStr?: string): Date {
        return normalizeToNoon(dateStr);
    }

    async simulateCredit(data: CreateCreditInput) {
        const start = this.normalizeDate(data.startDate);

        // Pre-fetch festivos desde DB (solo si la DB tiene cobertura completa para el rango)
        let precomputedHolidaySet: Set<string> | undefined;
        if (data.excludeHolidays) {
            const startYear = start.getFullYear();
            const termDaysNum = Number(data.termDays);
            const endYear = startYear + Math.ceil(termDaysNum / 365) + 1;
            const years = Array.from({ length: endYear - startYear + 1 }, (_, i) => startYear + i);
            // Verificar que la DB tiene filas para CADA año del rango
            const coveredYears = new Set(
                (await prisma.publicHoliday.findMany({
                    where: { year: { in: years }, country: 'CO' },
                    select: { year: true },
                    distinct: ['year'],
                })).map((r: { year: number }) => r.year)
            );
            const allCovered = years.every(y => coveredYears.has(y));
            if (allCovered) {
                const dbSet = await getHolidayDatesFromDB(years);
                if (dbSet.size > 0) precomputedHolidaySet = dbSet;
            }
            // Si no hay cobertura completa → precomputedHolidaySet queda undefined → calculateCreditPlan usa algoritmo
        }

        const options = {
            excludedWeekdays: data.excludedWeekdays,
            excludeHolidays: data.excludeHolidays,
            customRounding: data.customRounding,
            precomputedHolidaySet,
        };
        const plan = calculateCreditPlan(
            data.amount,
            data.interestRate,
            start,
            data.termDays,
            data.frequency,
            options
        );
        // Cuando hay exclusiones o redondeo personalizado, la fecha de fin real
        // es la del último pago (más precisa que termDays desde startDate).
        const hasOptions =
            (options.excludedWeekdays?.length ?? 0) > 0 ||
            options.excludeHolidays ||
            options.customRounding;
        const endDate =
            hasOptions && plan.paymentPlan.length > 0
                ? plan.paymentPlan[plan.paymentPlan.length - 1].dueDate
                : calculateEndDate(start, data.termDays);
        return { ...plan, endDate };
    }

    async createCredit(data: CreateCreditInput, userId: string, role: UserRole, ipAddress = '') {
        const start = this.normalizeDate(data.startDate);

        let targetBusinessId: string;
        if (role === 'super_admin') {
            if (!data.businessId) throw new Error('businessId es requerido para super_admin');
            targetBusinessId = data.businessId;
        } else {
            const userBusinessId = await this.getUserBusiness(userId);
            if (!userBusinessId) throw new Error('Usuario/Administrador no tiene negocio asignado');
            targetBusinessId = userBusinessId;
        }

        const client = await prisma.client.findUnique({
            where: { id: data.clientId },
            select: { id: true, fullName: true, businessId: true },
        });
        if (!client) throw new Error('Cliente no encontrado');
        if (client.businessId !== targetBusinessId) throw new Error('El cliente no pertenece al negocio seleccionado');

        const business = await prisma.business.findUnique({
            where: { id: targetBusinessId },
            select: { id: true, currentBalance: true, name: true },
        });
        if (!business) throw new Error('Negocio no encontrado');

        // ── Guard de idempotencia ante reintentos por respuesta perdida ──────────────
        // Un net::ERR_ABORTED / timeout puede hacer que la transacción del servidor COMMITEE
        // pero la respuesta HTTP nunca llegue al navegador. El usuario, viendo "No se pudo
        // conectar con el servidor", puede reenviar el mismo formulario. Sin este guard eso
        // crearía un SEGUNDO crédito duplicado y, si trae financings, una SEGUNDA aplicación
        // real de pago cruzado sobre el crédito fuente (descuadre de cuentas difícil de
        // detectar y revertir). Detectamos el reintento por una huella heurística — mismo
        // usuario + cliente + negocio + monto + tasa + plazo + frecuencia + fecha de inicio,
        // creado hace ≤3 minutos — y devolvemos el crédito ya existente sin crear nada nuevo
        // (operación idempotente: cero escrituras, cero pagos cruzados duplicados).
        const dupWindowStart = new Date(Date.now() - 3 * 60 * 1000);
        const possibleDuplicate = await prisma.credit.findFirst({
            where: {
                businessId: targetBusinessId,
                clientId: data.clientId,
                createdById: userId,
                amount: new Prisma.Decimal(data.amount),
                interestRate: new Prisma.Decimal(data.interestRate),
                termDays: data.termDays,
                paymentFrequency: data.frequency,
                startDate: start,
                // Si el "duplicado" fue cancelado en el ínterin (p. ej. el usuario lo creó y
                // luego lo canceló por error de caja), no es el resultado de un reintento útil:
                // no lo devolvemos como si fuera el crédito recién solicitado.
                status: { not: 'cancelled' },
                createdAt: { gte: dupWindowStart },
            },
            orderBy: { createdAt: 'desc' },
            select: { id: true },
        });
        if (possibleDuplicate) {
            logger.warn(
                `createCredit: posible reintento duplicado para cliente ${data.clientId} ` +
                `(crédito existente ${possibleDuplicate.id}); se devuelve el existente sin crear uno nuevo`
            );
            return this.getCreditById(possibleDuplicate.id, userId, role);
        }

        // ── Paso 1: Validar y calcular financiamientos cruzados ──────────────────────
        // Cada financing redirige un pago real de otro crédito activo/en mora para
        // cubrir parte del desembolso de este crédito nuevo. El efecto neto en caja
        // es CERO para la parte financiada: el payment_received (+) y el
        // loan_disbursement (−) se generan en la misma cuenta.
        interface ValidatedFinancing {
            creditId: string;
            scheduleId?: string;
            installmentNumber?: number;
            totalInstallments?: number;
            amount: number;
            clientName: string;  // nombre del cliente del crédito de origen (para auditoría)
            excessAction?: 'next_cuota' | 'donate';
        }
        const validatedFinancings: ValidatedFinancing[] = [];
        let financedSum = 0;

        if (data.financings && data.financings.length > 0) {
            // No se permiten pagos cruzados con fecha futura (misma protección que registerPayment)
            if (start > normalizeToNoon()) {
                throw new AppError('ERR_FINANCING_FUTURE_DATE', 'No se pueden registrar pagos cruzados con una fecha de inicio futura', 400);
            }

            // Acumuladores para validar que no se supere el saldo del crédito fuente
            // ni el pendiente de cada cuota fuente.
            const amountByCreditId = new Map<string, number>();
            const amountByScheduleId = new Map<string, number>();

            for (const f of data.financings) {
                if (!f.amount || f.amount <= 0) {
                    throw new Error('El monto de cada financiamiento debe ser mayor a 0');
                }

                // Cargar el crédito fuente con su cliente y cuotas
                const sourceCreditRaw = await prisma.credit.findUnique({
                    where: { id: f.creditId },
                    select: {
                        id: true,
                        businessId: true,
                        status: true,
                        remainingBalance: true,
                        client: { select: { fullName: true } },
                        _count: { select: { paymentSchedule: true } },
                        paymentSchedule: f.scheduleId
                            ? { where: { id: f.scheduleId }, select: { id: true, installmentNumber: true, scheduledAmount: true, paidAmount: true } }
                            : false,
                    },
                });

                if (!sourceCreditRaw) {
                    throw new AppError('ERR_CREDIT_SOURCE_NOT_FOUND', `Crédito fuente de financiamiento no encontrado: ${f.creditId}`, 404, { creditId: f.creditId });
                }
                if (sourceCreditRaw.businessId !== targetBusinessId) {
                    throw new AppError('ERR_CREDIT_WRONG_BUSINESS', `El crédito fuente ${f.creditId} no pertenece al negocio seleccionado`, 400, { creditId: f.creditId });
                }
                // Solo se rechazan paid y cancelled; active y overdue admiten pagos
                if (sourceCreditRaw.status === 'paid') {
                    throw new AppError('ERR_CREDIT_ALREADY_PAID', `El crédito ${f.creditId} ya está pagado y no puede recibir pagos adicionales`, 400, { creditId: f.creditId });
                }
                if (sourceCreditRaw.status === 'cancelled') {
                    throw new AppError('ERR_CREDIT_CANCELLED', `El crédito ${f.creditId} está cancelado y no puede recibir pagos`, 400, { creditId: f.creditId });
                }

                // Validar que la suma acumulada para este creditId no supere su remainingBalance.
                // Se omite si hay excessAction: el excedente se procesará como donate/next_cuota
                // dentro de applyPaymentTx (que ya implementa esa lógica correctamente).
                const prevForCredit = amountByCreditId.get(f.creditId) ?? 0;
                const totalForCredit = prevForCredit + f.amount;
                const remainingOfCredit = Number(sourceCreditRaw.remainingBalance);
                if (!f.excessAction && totalForCredit > remainingOfCredit + 0.01) {
                    throw new AppError(
                        'ERR_FINANCING_EXCEEDS_BALANCE',
                        `La suma de financiamientos para el crédito ${f.creditId.slice(0, 8)} ` +
                        `($${Math.ceil(totalForCredit).toLocaleString('es-CO')}) supera el saldo pendiente ` +
                        `($${Math.ceil(remainingOfCredit).toLocaleString('es-CO')})`,
                        400,
                        { creditId: f.creditId, totalForCredit, remainingOfCredit }
                    );
                }
                amountByCreditId.set(f.creditId, totalForCredit);

                // Si trae scheduleId: validar que pertenece al crédito y que el monto no excede el pendiente
                if (f.scheduleId) {
                    const scheduleRows = (sourceCreditRaw.paymentSchedule as { id: string; installmentNumber: number; scheduledAmount: Prisma.Decimal; paidAmount: Prisma.Decimal }[] | false);
                    const targetSchedule = scheduleRows && scheduleRows.length > 0 ? scheduleRows[0] : null;
                    if (!targetSchedule) {
                        throw new AppError('ERR_SCHEDULE_NOT_FOUND', `La cuota ${f.scheduleId} no pertenece al crédito ${f.creditId}`, 400, { scheduleId: f.scheduleId, creditId: f.creditId });
                    }
                    const schedulePending = Number(targetSchedule.scheduledAmount) - Number(targetSchedule.paidAmount);
                    const prevForSchedule = amountByScheduleId.get(f.scheduleId) ?? 0;
                    const totalForSchedule = prevForSchedule + f.amount;
                    // Se omite el cap si hay excessAction: el excedente se procesa en applyPaymentTx.
                    if (!f.excessAction && totalForSchedule > Math.ceil(schedulePending) + 0.01) {
                        throw new AppError(
                            'ERR_FINANCING_EXCEEDS_SCHEDULE',
                            `La suma de financiamientos para la cuota ${f.scheduleId.slice(0, 8)} ` +
                            `($${Math.ceil(totalForSchedule).toLocaleString('es-CO')}) supera el pendiente ` +
                            `($${Math.ceil(schedulePending).toLocaleString('es-CO')})`,
                            400,
                            { scheduleId: f.scheduleId, totalForSchedule, schedulePending }
                        );
                    }
                    amountByScheduleId.set(f.scheduleId, totalForSchedule);
                }

                const scheduleRowsForNum = (sourceCreditRaw.paymentSchedule as { id: string; installmentNumber: number }[] | false);
                const installmentNumber = f.scheduleId && scheduleRowsForNum && scheduleRowsForNum.length > 0
                    ? scheduleRowsForNum[0].installmentNumber
                    : undefined;

                validatedFinancings.push({
                    creditId: f.creditId,
                    scheduleId: f.scheduleId,
                    installmentNumber,
                    totalInstallments: sourceCreditRaw._count.paymentSchedule,
                    amount: f.amount,
                    clientName: sourceCreditRaw.client.fullName,
                    excessAction: f.excessAction,
                });
                financedSum += f.amount;
            }

            // La suma de financiamientos no puede superar el monto del crédito nuevo
            if (financedSum > data.amount + 0.01) {
                throw new AppError(
                    'ERR_FINANCING_EXCEEDS_CREDIT',
                    `La suma de financiamientos ($${Math.ceil(financedSum).toLocaleString('es-CO')}) ` +
                    `supera el monto del crédito ($${Math.ceil(data.amount).toLocaleString('es-CO')})`,
                    400,
                    { financedSum, creditAmount: data.amount }
                );
            }
        }

        // cashNeeded: parte del desembolso que realmente sale de caja
        // Si financedSum === data.amount → cashNeeded === 0 (financiamiento 100%)
        const cashNeeded = data.amount - financedSum;

        // Resolver cuenta de desembolso sin efectos secundarios (solo lectura).
        // ensureDefaultAccount (que escribe en DB) se difiere hasta después de todas
        // las validaciones para no crear una cuenta huérfana si el saldo es insuficiente.
        let disbursementAccountId: string | null = null;
        let disbursementAccountName: string;
        let needsDefaultAccount = false;

        if (data.accountId) {
            // Cuenta explícita: validar que pertenece al negocio y está activa
            const accExplicit = await prisma.paymentAccount.findFirst({
                where: { id: data.accountId, businessId: targetBusinessId, active: true },
                select: { id: true, name: true },
            });
            if (!accExplicit) throw new Error('Cuenta de desembolso no válida');
            disbursementAccountId   = accExplicit.id;
            disbursementAccountName = accExplicit.name;
        } else {
            // Usar el predeterminado de desembolso (isDisbursementDefault → isDefault → primera)
            const accounts = await prisma.paymentAccount.findMany({
                where: { businessId: targetBusinessId, active: true },
                orderBy: [{ isDisbursementDefault: 'desc' }, { isDefault: 'desc' }, { name: 'asc' }],
                select: { id: true, name: true, isDisbursementDefault: true, isDefault: true },
            });
            const defAcc = accounts[0];
            if (!defAcc) {
                // No hay cuentas activas: crear "Efectivo" más adelante (después de validar saldo)
                needsDefaultAccount = true;
                disbursementAccountName = 'Efectivo';
            } else {
                disbursementAccountId   = defAcc.id;
                disbursementAccountName = defAcc.name;
            }
        }

        // Validar saldo de caja solo si cashNeeded > 0
        if (cashNeeded > 0) {
            // Validar que el saldo TOTAL del negocio alcanza (error estructurado → abre modal de recarga)
            if (Number(business.currentBalance) < cashNeeded) {
                const errBiz: any = new Error(
                    `Saldo insuficiente en caja. Disponible: $${Math.ceil(Number(business.currentBalance)).toLocaleString('es-CO')}, ` +
                    `se necesitan $${Math.ceil(cashNeeded).toLocaleString('es-CO')}`
                );
                errBiz.code    = 'INSUFFICIENT_BUSINESS_BALANCE';
                errBiz.details = {
                    accountId:   disbursementAccountId ?? '',
                    accountName: disbursementAccountName,
                    available:   Number(business.currentBalance),
                    required:    cashNeeded,
                    scope:       'business',
                };
                throw errBiz;
            }

            // Crear la cuenta por defecto solo si NO vienen splits explícitos
            if (needsDefaultAccount && !(data.splits && data.splits.length > 0)) {
                disbursementAccountId = await accountService.ensureDefaultAccount(targetBusinessId, userId);
            }

            // Validar saldo de la cuenta de desembolso
            const { accounts: accBalances } = await accountService.getBalances(targetBusinessId, userId, role);
            const accBalance = accBalances.find(a => a.id === disbursementAccountId);
            const available = accBalance?.balance ?? 0;
            if (!data.splits?.length && available < cashNeeded) {
                const err: any = new Error(`Saldo insuficiente en la cuenta "${disbursementAccountName}" ($${available.toLocaleString('es-CO')} disponible, se necesitan $${cashNeeded.toLocaleString('es-CO')})`);
                err.code    = 'INSUFFICIENT_ACCOUNT_BALANCE';
                err.details = { accountId: disbursementAccountId, accountName: disbursementAccountName, available, required: cashNeeded, scope: 'account' };
                throw err;
            }

            // Validar splits si vienen
            if (data.splits && data.splits.length > 0) {
                // 1. Validar IDs duplicados
                const uniqueIds = new Set(data.splits.map(s => s.accountId));
                if (uniqueIds.size !== data.splits.length) {
                    throw new Error('El reparto no puede incluir la misma cuenta dos veces');
                }
                // 2. Validar que la suma cuadra con cashNeeded (la parte que sale de caja)
                const splitSum = data.splits.reduce((s, e) => s + e.amount, 0);
                if (Math.abs(splitSum - cashNeeded) > 1) {
                    throw new Error(`El reparto de cuentas suma $${Math.ceil(splitSum).toLocaleString('es-CO')} pero el monto neto de caja es $${Math.ceil(cashNeeded).toLocaleString('es-CO')}`);
                }
                // 3. Validar cada cuenta y su saldo
                const { accounts: accBalances2 } = await accountService.getBalances(targetBusinessId, userId, role);
                for (const split of data.splits) {
                    const acc = await prisma.paymentAccount.findFirst({
                        where: { id: split.accountId, businessId: targetBusinessId, active: true },
                        select: { id: true, name: true },
                    });
                    if (!acc) throw new Error(`Cuenta de desembolso no válida: ${split.accountId}`);
                    const accBal = accBalances2.find(a => a.id === split.accountId)?.balance ?? 0;
                    if (accBal < split.amount) {
                        const errSplit: any = new Error(`Saldo insuficiente en la cuenta "${acc.name}" ($${Math.ceil(accBal).toLocaleString('es-CO')} disponible, se necesitan $${Math.ceil(split.amount).toLocaleString('es-CO')})`);
                        errSplit.code    = 'INSUFFICIENT_ACCOUNT_BALANCE';
                        errSplit.details = { accountId: acc.id, accountName: acc.name, available: accBal, required: split.amount, scope: 'account' };
                        throw errSplit;
                    }
                }
            }
        } else {
            // cashNeeded === 0: financiamiento 100% — no se exige saldo de cuenta ni de negocio.
            // Aún así se necesita una cuenta válida para anclar los loan_disbursement financiados.
            if (needsDefaultAccount && !(data.splits && data.splits.length > 0)) {
                disbursementAccountId = await accountService.ensureDefaultAccount(targetBusinessId, userId);
            }
        }

        // Resolver resolvedSplits solo si cashNeeded > 0 y vienen splits
        const resolvedSplits: { accountId: string; accountName: string; amount: number }[] = [];
        if (cashNeeded > 0 && data.splits && data.splits.length > 0) {
            for (const split of data.splits) {
                const acc = await prisma.paymentAccount.findFirst({
                    where: { id: split.accountId, businessId: targetBusinessId, active: true },
                    select: { id: true, name: true },
                });
                if (!acc) throw new Error(`Cuenta de desembolso no válida: ${split.accountId}`);
                // Saldo ya fue validado arriba; solo necesitamos el nombre
                resolvedSplits.push({ accountId: acc.id, accountName: acc.name, amount: split.amount });
            }
        }

        const simulation = await this.simulateCredit(data);

        const result = await prisma.$transaction(async (tx) => {
            // Bloquear el día antes de cualquier escritura (aplica también a pagos cruzados)
            if (validatedFinancings.length > 0) {
                await accountService.assertDayOpen(targetBusinessId, start);
            }

            // ── Revalidar financiamientos dentro de la tx (mitigación TOCTOU) ─────
            // La validación previa se hizo con el cliente prisma global. Si entre esa
            // lectura y ahora alguien registró un pago sobre el crédito fuente, los
            // valores habrán cambiado. Revalidamos con `tx` para que, si algo cambió,
            // la transacción haga rollback con un mensaje claro en vez de fallar
            // dentro de applyPaymentTx con un mensaje de "excessAction" que no aplica.
            {
                const txAmountByCreditId = new Map<string, number>();
                const txAmountByScheduleId = new Map<string, number>();
                for (const f of validatedFinancings) {
                    const src = await tx.credit.findUnique({
                        where: { id: f.creditId },
                        select: {
                            status: true,
                            remainingBalance: true,
                            paymentSchedule: f.scheduleId
                                ? { where: { id: f.scheduleId }, select: { id: true, scheduledAmount: true, paidAmount: true } }
                                : false,
                        },
                    });
                    if (!src) throw new Error(`El crédito fuente ${f.creditId.slice(0, 8)} ya no existe. Intenta de nuevo.`);
                    if (src.status === 'paid' || src.status === 'cancelled') {
                        throw new Error(`El crédito fuente ${f.creditId.slice(0, 8)} cambió de estado mientras se procesaba la operación. Intenta de nuevo.`);
                    }
                    const prevCredit = txAmountByCreditId.get(f.creditId) ?? 0;
                    const totalCredit = prevCredit + f.amount;
                    // Respetar la misma lógica de excessAction: si hay excessAction el exceso
                    // es intencional y applyPaymentTx lo manejará; solo validar si no hay excessAction.
                    if (!f.excessAction && totalCredit > Number(src.remainingBalance) + 0.01) {
                        throw new Error(`El crédito fuente ${f.creditId.slice(0, 8)} cambió de estado mientras se procesaba la operación. Intenta de nuevo.`);
                    }
                    txAmountByCreditId.set(f.creditId, totalCredit);
                    if (f.scheduleId) {
                        const scheduleRows = src.paymentSchedule as { id: string; scheduledAmount: Prisma.Decimal; paidAmount: Prisma.Decimal }[] | false;
                        const sched = scheduleRows && scheduleRows[0];
                        if (!sched) throw new Error(`La cuota ${f.scheduleId.slice(0, 8)} ya no existe en el crédito fuente. Intenta de nuevo.`);
                        const pending = Number(sched.scheduledAmount) - Number(sched.paidAmount);
                        const prevSched = txAmountByScheduleId.get(f.scheduleId) ?? 0;
                        const totalSched = prevSched + f.amount;
                        if (!f.excessAction && totalSched > Math.ceil(pending) + 0.01) {
                            throw new Error(`El crédito fuente ${f.creditId.slice(0, 8)} cambió de estado mientras se procesaba la operación. Intenta de nuevo.`);
                        }
                        txAmountByScheduleId.set(f.scheduleId, totalSched);
                    }
                }
            }

            // ── Aplicar pagos cruzados ANTES de crear el crédito ──────────────────
            // Cada financing genera un Payment real + CashMovement payment_received en la
            // cuenta de desembolso. El loan_disbursement correspondiente se crea después,
            // en la misma cuenta, para que el efecto neto sea CERO en esa cuenta.
            // NOTA MVP: si vienen financings Y splits a la vez, los pagos cruzados se
            // aplican siempre contra la cuenta de desembolso principal (disbursementAccountId)
            // para garantizar la cancelación exacta; los splits solo aplican a cashNeeded.
            for (const f of validatedFinancings) {
                await this.applyPaymentTx(tx, {
                    creditId:      f.creditId,
                    amount:        f.amount,
                    payDate:       start,
                    scheduleId:    f.scheduleId,
                    accountId:     disbursementAccountId ?? undefined,
                    paymentMethod: disbursementAccountName,
                    notes:         `Pago cruzado: financia desembolso de crédito a ${client.fullName}`,
                    userId,
                    role,
                    ipAddress,
                    // Si el usuario indicó que el excedente debe donarse o abonarse a la
                    // siguiente cuota, propagamos la acción a applyPaymentTx que ya la implementa.
                    excessAction:  f.excessAction,
                });
            }

            const credit = await tx.credit.create({
                data: {
                    businessId: targetBusinessId,
                    clientId: data.clientId,
                    amount: new Prisma.Decimal(data.amount),
                    interestRate: new Prisma.Decimal(data.interestRate),
                    totalWithInterest: new Prisma.Decimal(simulation.totalWithInterest),
                    paymentFrequency: data.frequency,
                    startDate: start,
                    endDate: simulation.endDate,
                    termDays: data.termDays,
                    remainingBalance: new Prisma.Decimal(simulation.totalWithInterest),
                    status: 'active',
                    createdById: userId,
                },
                select: {
                    id: true, businessId: true, clientId: true, amount: true,
                    interestRate: true, totalWithInterest: true, paymentFrequency: true,
                    startDate: true, endDate: true, termDays: true, remainingBalance: true,
                    status: true, createdById: true, createdAt: true, updatedAt: true,
                },
            });

            await tx.paymentSchedule.createMany({
                data: simulation.paymentPlan.map((p) => ({
                    creditId: credit.id,
                    installmentNumber: p.installmentNumber,
                    dueDate: p.dueDate,
                    scheduledAmount: new Prisma.Decimal(p.scheduledAmount),
                    paidAmount: new Prisma.Decimal(0),
                    status: 'pending',
                })),
            });

            // Re-leer el balance dentro de la tx para evitar TOCTOU: otra operación
            // concurrente pudo modificar currentBalance entre la validación previa y este write.
            // IMPORTANTE: si hubo financings, applyPaymentTx ya habrá incrementado
            // currentBalance en +financedSum (por los payment_received). Por tanto,
            // balanceAtTx = balanceOriginal + financedSum. El desembolso es por data.amount
            // completo → newBalance = balanceAtTx − data.amount = balanceOriginal − cashNeeded.
            // Esto es correcto: solo sale de caja el neto real.
            const { currentBalance: balanceAtTx } = await tx.business.findUniqueOrThrow({
                where: { id: targetBusinessId },
                select: { currentBalance: true },
            });
            const newBalance = new Prisma.Decimal(balanceAtTx).minus(data.amount);

            // Running balance para los loan_disbursement que vamos a crear
            let runningBalance = new Prisma.Decimal(balanceAtTx);

            // ── Loan disbursements por financiamientos cruzados ───────────────────
            for (const f of validatedFinancings) {
                runningBalance = runningBalance.minus(f.amount);
                await tx.cashMovement.create({
                    data: {
                        businessId: targetBusinessId,
                        type: 'loan_disbursement',
                        amount: new Prisma.Decimal(f.amount),
                        balanceAfter: runningBalance,
                        description: (() => {
                            if (f.installmentNumber == null) return `Pago de ${f.clientName}`;
                            const isLast = f.totalInstallments != null && f.installmentNumber === f.totalInstallments;
                            return isLast
                                ? `Última cuota de ${f.clientName}`
                                : `Cuota #${f.installmentNumber} de ${f.clientName}`;
                        })(),
                        relatedCreditId: credit.id,
                        paymentMethod: disbursementAccountName,
                        accountId: disbursementAccountId,
                        createdById: userId,
                    },
                });
            }

            // ── Loan disbursements por la parte que sale de caja (cashNeeded) ─────
            if (cashNeeded > 0) {
                if (resolvedSplits.length > 0) {
                    // Multi-cuenta: un loan_disbursement por split con balanceAfter acumulado
                    for (const split of resolvedSplits) {
                        runningBalance = runningBalance.minus(split.amount);
                        await tx.cashMovement.create({
                            data: {
                                businessId: targetBusinessId,
                                type: 'loan_disbursement',
                                amount: new Prisma.Decimal(split.amount),
                                balanceAfter: runningBalance,
                                description: `Desembolso a ${client.fullName}`,
                                relatedCreditId: credit.id,
                                paymentMethod: split.accountName,
                                accountId: split.accountId,
                                createdById: userId,
                            },
                        });
                    }
                } else {
                    // Una cuenta (ruta original para la parte neta de caja)
                    runningBalance = runningBalance.minus(cashNeeded);
                    await tx.cashMovement.create({
                        data: {
                            businessId: targetBusinessId,
                            type: 'loan_disbursement',
                            amount: new Prisma.Decimal(cashNeeded),
                            balanceAfter: runningBalance,
                            description: `Desembolso crédito a ${client.fullName}`,
                            relatedCreditId: credit.id,
                            paymentMethod: disbursementAccountName,
                            accountId: disbursementAccountId,
                            createdById: userId,
                        },
                    });
                }
            }

            await tx.business.update({
                where: { id: targetBusinessId },
                data: { currentBalance: newBalance },
            });

            await tx.auditLog.create({
                data: {
                    userId, businessId: targetBusinessId,
                    action: 'CREATE_CREDIT',
                    description: `Creó crédito para ${client.fullName} por ${data.amount}`,
                    entityType: 'Credit', entityId: credit.id,
                    newValues: {
                        credit,
                        scheduleCount: simulation.paymentPlan.length,
                        ...(validatedFinancings.length > 0 && {
                            financings: validatedFinancings.map(f => ({
                                creditId:   f.creditId,
                                clientName: f.clientName,
                                scheduleId: f.scheduleId ?? null,
                                amount:     f.amount,
                            })),
                        }),
                    },
                    ipAddress,
                },
            });

            return credit;
        }, {
            // Margen para conexiones cross-region / cold starts de serverless.
            // Se sube a 10 s / 20 s para acomodar los N pagos cruzados dentro de la tx.
            maxWait: 10000,
            timeout: 20000,
        });

        return this.getCreditById(result.id, userId, role);
    }

    async listCredits(userId: string, role: UserRole, filters: ListFilters = {}) {
        let businessId: string | undefined = filters.businessId;

        if (role !== 'super_admin') {
            const userBusinessId = await this.getUserBusiness(userId);
            if (!userBusinessId) throw new Error('No tiene negocio asignado');
            if (businessId && businessId !== userBusinessId) throw new Error('No tiene permisos para ver créditos de otro negocio');
            businessId = userBusinessId;
        }

        const where: Prisma.CreditWhereInput = {
            ...(businessId && { businessId }),
            ...(filters.clientId && { clientId: filters.clientId }),
            // Excluir cancelados por defecto; si se pasa status explícito se respeta
            ...(filters.status
                ? { status: filters.status as any }
                : { status: { not: 'cancelled' as any } }),
        };

        const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
        const startOfBogotaToday = new Date(`${todayStr}T00:00:00.000-05:00`);
        const endOfBogotaToday = new Date(startOfBogotaToday.getTime() + 24 * 60 * 60 * 1000);

        if (filters.dueToday) {
            where.paymentSchedule = {
                some: {
                    dueDate: { gte: startOfBogotaToday, lt: endOfBogotaToday },
                    status: { in: ['pending', 'partial', 'overdue'] }
                }
            };
        }

        if (filters.overdue) {
            where.AND = [
                ...(where.AND ? (Array.isArray(where.AND) ? where.AND : [where.AND]) : []),
                {
                    OR: [
                        { status: 'overdue' },
                        { paymentSchedule: { some: { status: 'overdue' } } },
                        { paymentSchedule: { some: { dueDate: { lt: startOfBogotaToday }, status: { in: ['pending', 'partial', 'overdue'] } } } }
                    ]
                }
            ];
        }

        return prisma.credit.findMany({
            where,
            include: { client: true, paymentSchedule: true },
            orderBy: { createdAt: 'desc' },
        });
    }

    async getCreditById(creditId: string, userId: string, role: UserRole) {
        const credit = await prisma.credit.findUnique({
            where: { id: creditId },
            include: {
                client: true,
                paymentSchedule: { orderBy: { dueDate: 'asc' } },
                payments: { orderBy: { paymentDate: 'desc' } },
            },
        });

        if (!credit) throw new Error('Crédito no encontrado');

        if (role !== 'super_admin') {
            const userBusinessId = await this.getUserBusiness(userId);
            if (!userBusinessId || userBusinessId !== credit.businessId) {
                throw new Error('No tiene permisos para ver este crédito');
            }
        }

        return credit;
    }

    /**
     * Lógica reutilizable de aplicación de pago (cuerpo extraído de registerPayment).
     * Debe llamarse DENTRO de una $transaction existente (`tx`).
     * Aplica el pago sobre el crédito indicado, actualiza cuotas, saldo del crédito,
     * saldo del negocio y genera los CashMovement correspondientes.
     *
     * El llamador es responsable de garantizar, ANTES de invocar este método, que:
     *   1. La fecha de pago no es futura (validación anti-fecha-futura).
     *   2. El día está abierto (`assertDayOpen`).
     * Ambas condiciones deben cumplirse antes de las escrituras, ya sea fuera de la
     * transacción (como hace `registerPayment`) o al inicio de la propia transacción
     * (como hace `createCredit`, que ejecuta `assertDayOpen` al inicio de su `$transaction`
     * y valida la fecha futura antes de abrirla).
     */
    private async applyPaymentTx(
        tx: Prisma.TransactionClient,
        params: {
            creditId: string;
            amount: number;
            payDate: Date;
            paymentMethod?: string;
            notes?: string;
            scheduleId?: string;
            accountId?: string;
            excessAction?: 'next_cuota' | 'donate';
            userId: string;
            role: UserRole;
            ipAddress?: string;
        }
    ) {
        const { creditId, amount, payDate, paymentMethod, notes, scheduleId, accountId, excessAction, userId, role, ipAddress: _ipAddress } = params;

        const credit = await tx.credit.findUnique({
            where: { id: creditId },
            include: {
                client: true,
                paymentSchedule: { orderBy: { dueDate: 'asc' } },
                business: true,
            },
        });
        if (!credit) throw new Error('Crédito no encontrado');

        if (role !== 'super_admin') {
            const userBusinessId = await this.getUserBusiness(userId);
            if (!userBusinessId || userBusinessId !== credit.businessId) {
                throw new Error('No tiene permisos para operar este crédito');
            }
        }

        if (credit.status === 'paid') throw new Error('El crédito ya está pagado');
        if (amount <= 0) throw new Error('El monto debe ser mayor a 0');

        // Resolver la cuenta del pago: la enviada (si es válida y del negocio) o la cuenta por defecto
        let effectiveAccountId: string | null = null;
        if (accountId) {
            const acc = await tx.paymentAccount.findFirst({ where: { id: accountId, businessId: credit.businessId, active: true }, select: { id: true } });
            effectiveAccountId = acc?.id || null;
        }
        if (!effectiveAccountId) {
            const def = await tx.paymentAccount.findFirst({ where: { businessId: credit.businessId, isDefault: true, active: true }, select: { id: true } })
                || await tx.paymentAccount.findFirst({ where: { businessId: credit.businessId, active: true }, select: { id: true } });
            effectiveAccountId = def?.id || null;
        }

        const currentRemaining = Number(credit.remainingBalance);

        // appliedToCredit: monto que efectivamente reduce remainingBalance
        // donationAmount: excedente que el usuario decidió donar (no reduce saldo)
        let appliedToCredit = Math.min(amount, currentRemaining);
        let donationAmount = 0;

        if (scheduleId) {
            // ── Pago con cuota específica ──
            const target = credit.paymentSchedule.find((s) => s.id === scheduleId);
            if (!target) throw new Error('La cuota seleccionada no pertenece a este crédito');
            const scheduledPending = Number(target.scheduledAmount) - Number(target.paidAmount);
            if (scheduledPending <= 0) throw new Error('La cuota ya está pagada');

            // Usar Math.ceil como umbral de exceso para alinear con el redondeo del frontend.
            // El frontend muestra y envía Math.ceil(scheduledPending); sin ceil aquí se detecta
            // un falso excedente de $1 cuando el usuario paga exactamente la cuota mostrada.
            const scheduledPendingCeil = Math.ceil(scheduledPending);
            if (amount > scheduledPendingCeil + 0.01) {
                // ── Hay sobrepago: requiere acción explícita ──
                if (!excessAction) {
                    throw new Error(
                        `El pago de $${amount} supera el monto pendiente de la cuota ($${scheduledPendingCeil}). ` +
                        `Debe especificar excessAction: "next_cuota" (abonar a la siguiente cuota) o "donate" (donar al negocio).`
                    );
                }

                const excess = amount - scheduledPendingCeil;

                // Marcar la cuota actual como pagada completa
                await tx.paymentSchedule.update({
                    where: { id: scheduleId },
                    data: {
                        paidAmount: target.scheduledAmount,
                        status: 'paid',
                    },
                });

                if (excessAction === 'donate') {
                    // El excedente NO reduce saldo; queda como donación/ganancia para el negocio
                    appliedToCredit = scheduledPending;
                    donationAmount = excess;
                } else if (excessAction === 'next_cuota') {
                    // Aplicar el excedente en cascada a las cuotas siguientes (en orden de fecha)
                    // hasta agotarlo. Esto evita descuadre entre el saldo y el schedule cuando el
                    // excedente supera la capacidad de una sola cuota.
                    const sortedByDate = [...credit.paymentSchedule].sort(
                        (a, b) => a.dueDate.getTime() - b.dueDate.getTime()
                    );
                    const targetIdx = sortedByDate.findIndex(s => s.id === scheduleId);
                    let restante = excess;
                    for (const s of sortedByDate.slice(targetIdx + 1)) {
                        if (restante <= 0.01) break;
                        const pendiente = Number(s.scheduledAmount) - Number(s.paidAmount);
                        if (pendiente <= 0) continue;
                        const aplicar = Math.min(restante, pendiente);
                        const nuevoPaid = Number(s.paidAmount) + aplicar;
                        const fullPaid = nuevoPaid >= Number(s.scheduledAmount) - 0.01;
                        await tx.paymentSchedule.update({
                            where: { id: s.id },
                            data: {
                                paidAmount: new Prisma.Decimal(nuevoPaid),
                                status: fullPaid ? 'paid' : (s.dueDate < payDate ? 'overdue' : 'partial'),
                            },
                        });
                        restante -= aplicar;
                    }
                    // Si sobró excedente que ninguna cuota pudo absorber (pagó más que toda la
                    // deuda restante), ese remanente se trata como donación para no descuadrar.
                    if (restante > 0.01) {
                        appliedToCredit = scheduledPending + (excess - restante);
                        donationAmount = restante;
                    }
                    // Si no sobró, appliedToCredit = min(amount, currentRemaining) reduce el saldo completo.
                }
            } else {
                // ── No hay sobrepago: aplicación normal a la cuota ──
                const newPaid = Number(target.paidAmount) + appliedToCredit;
                const isPaidFull = newPaid >= Number(target.scheduledAmount);
                await tx.paymentSchedule.update({
                    where: { id: scheduleId },
                    data: {
                        paidAmount: new Prisma.Decimal(Math.min(newPaid, Number(target.scheduledAmount))),
                        status: isPaidFull ? 'paid' : (target.dueDate < payDate ? 'overdue' : 'partial'),
                    },
                });
            }
        } else {
            // ── Sin cuota específica: distribución automática ──
            const distribution = this.calculatePaymentDistribution(appliedToCredit, credit.paymentSchedule, payDate);
            for (const item of distribution.affectedSchedules) {
                await tx.paymentSchedule.update({
                    where: { id: item.id },
                    data: {
                        paidAmount: new Prisma.Decimal(item.newPaidAmount),
                        status: item.newStatus,
                    },
                });
            }
        }

        const newRemaining = new Prisma.Decimal(currentRemaining).minus(appliedToCredit);
        const isCreditFullyPaid = Number(newRemaining) <= 0;

        // Si el crédito se completó, marcar TODAS las cuotas restantes como pagadas.
        // Optimización: usar las cuotas ya cargadas en memoria (credit.paymentSchedule) y
        // ejecutar todas las actualizaciones en paralelo con Promise.all.
        let creditStatus: 'paid' | 'overdue' | 'active';
        if (isCreditFullyPaid) {
            const pendingFromMemory = credit.paymentSchedule.filter(
                s => s.status !== 'paid' && s.id !== scheduleId
            );
            if (pendingFromMemory.length > 0) {
                await Promise.all(pendingFromMemory.map(s =>
                    tx.paymentSchedule.update({
                        where: { id: s.id },
                        data: { status: 'paid', paidAmount: s.scheduledAmount }
                    })
                ));
            }
            creditStatus = 'paid';
        } else {
            // Calcular si hay alguna cuota overdue desde memoria (evita query extra).
            // Una cuota está overdue si: dueDate < hoy AND status != paid AND tiene saldo pendiente.
            const hasOverdue = credit.paymentSchedule.some(s =>
                s.dueDate < payDate &&
                s.status !== 'paid' &&
                s.id !== scheduleId && // la actual ya se manejó
                Number(s.scheduledAmount) > Number(s.paidAmount)
            );
            creditStatus = hasOverdue ? 'overdue' : 'active';
        }

        // ── Registrar pago ──
        // amountToPrincipal = lo que reduce el saldo del crédito
        // amountToInterest = lo donado al negocio (ganancia explícita por sobrepago)
        const noteWithDonation = donationAmount > 0
            ? `[DONACIÓN: $${donationAmount.toLocaleString('es-CO')}]${notes ? ' ' + notes : ''}`
            : notes;
        const payment = await tx.payment.create({
            data: {
                creditId,
                amount: new Prisma.Decimal(amount),
                paymentDate: payDate,
                amountToPrincipal: new Prisma.Decimal(appliedToCredit),
                amountToInterest: new Prisma.Decimal(donationAmount),
                remainingBalanceAfter: newRemaining,
                paymentMethod,
                notes: noteWithDonation,
                // Vincular el pago a la cuota seleccionada (si la hay). En el caso
                // excessAction='next_cuota' el pago se liga a la cuota target original;
                // la siguiente cuota solo recibe el abono parcial en su paidAmount.
                scheduleId: scheduleId || null,
                accountId: effectiveAccountId,
                createdById: userId,
            },
        });

        // ── Caja: entrada del pago recibido ──
        // Si hay donación, se divide en 2 movimientos para mantener cuadre contable:
        //   payment_received: el monto que efectivamente reduce el saldo del crédito
        //   interest_earned:  la donación al negocio (ganancia inmediata)
        // Total = amount (lo que pagó el cliente). business.currentBalance se actualiza una vez.
        const principalForCash = amount - donationAmount;
        const balanceAfterPrincipal = new Prisma.Decimal(credit.business.currentBalance).plus(principalForCash);
        const newBusinessBalance = balanceAfterPrincipal.plus(donationAmount);

        // ── Si el crédito se paga completamente: calcular ganancia restante ──
        // profit total = sum(payments.amount) - capital. Parte ya se registró como donaciones
        // (interest_earned) durante el crédito; solo registramos la parte adicional.
        // NOTA: allPayments YA incluye el pago recién creado (lectura ve escrituras de la misma
        // transacción), por lo que su amountToInterest ya cuenta la donación actual — NO se suma aparte.
        let profit = 0;
        let interestMovementData: Prisma.CashMovementCreateInput | null = null;
        if (isCreditFullyPaid) {
            const allPayments = await tx.payment.findMany({
                where: { creditId },
                select: { amount: true, amountToInterest: true },
            });
            const totalPaid = allPayments.reduce((sum, p) => sum + Number(p.amount), 0);
            const totalDonatedAlready = allPayments.reduce((sum, p) => sum + Number(p.amountToInterest), 0);
            const originalAmount = Number(credit.amount);
            profit = totalPaid - originalAmount;
            const remainingProfitToRecord = profit - totalDonatedAlready;

            if (remainingProfitToRecord > 0.01) {
                interestMovementData = {
                    business: { connect: { id: credit.businessId } },
                    type: 'interest_earned',
                    amount: new Prisma.Decimal(remainingProfitToRecord),
                    balanceAfter: newBusinessBalance,
                    description: `Interés crédito pagado - ${credit.client.fullName} | Capital: $${originalAmount.toLocaleString('es-CO')} | Total: $${totalPaid.toLocaleString('es-CO')} | Donaciones previas: $${totalDonatedAlready.toLocaleString('es-CO')}`,
                    relatedCredit: { connect: { id: credit.id } },
                    paymentMethod: 'efectivo',
                    ...(effectiveAccountId ? { account: { connect: { id: effectiveAccountId } } } : {}),
                    createdBy: { connect: { id: userId } },
                };
            }
        }

        // ── Escrituras independientes en paralelo (reducen round-trips a la DB) ──
        // Todas referencian payment.id / valores ya calculados, no dependen entre sí.
        await Promise.all([
            // Movimiento de caja: pago recibido
            tx.cashMovement.create({
                data: {
                    businessId: credit.businessId,
                    type: 'payment_received',
                    amount: new Prisma.Decimal(principalForCash),
                    balanceAfter: balanceAfterPrincipal,
                    description: `Pago crédito ${credit.id.slice(0, 8)} - ${credit.client.fullName}${donationAmount > 0 ? ` (pago $${amount.toLocaleString('es-CO')}, donación $${donationAmount.toLocaleString('es-CO')} aparte)` : ''}`,
                    relatedCreditId: credit.id,
                    relatedPaymentId: payment.id,
                    paymentMethod: paymentMethod || 'efectivo',
                    accountId: effectiveAccountId,
                    createdById: userId,
                },
            }),
            // Movimiento de ganancia inmediata por donación (si aplica)
            donationAmount > 0
                ? tx.cashMovement.create({
                    data: {
                        businessId: credit.businessId,
                        type: 'interest_earned',
                        amount: new Prisma.Decimal(donationAmount),
                        balanceAfter: newBusinessBalance,
                        description: `Donación al negocio - ${credit.client.fullName} (excedente sobre cuota)`,
                        relatedCreditId: credit.id,
                        relatedPaymentId: payment.id,
                        paymentMethod: paymentMethod || 'efectivo',
                        accountId: effectiveAccountId,
                        createdById: userId,
                    },
                })
                : Promise.resolve(),
            // Movimiento de interés al cerrar el crédito (si aplica)
            interestMovementData
                ? tx.cashMovement.create({ data: interestMovementData })
                : Promise.resolve(),
            // Actualizar saldo del negocio
            tx.business.update({
                where: { id: credit.businessId },
                data: { currentBalance: newBusinessBalance },
            }),
            // Actualizar el crédito
            tx.credit.update({
                where: { id: creditId },
                data: {
                    remainingBalance: newRemaining,
                    status: creditStatus,
                    ...(isCreditFullyPaid ? {
                        completionDate: payDate,
                        earnedInterest: new Prisma.Decimal(profit > 0 ? profit : 0)
                    } : {})
                },
            }),
            // Auditoría
            tx.auditLog.create({
                data: {
                    userId,
                    businessId: credit.businessId,
                    action: 'REGISTER_PAYMENT',
                    description: `Pago de $${amount.toLocaleString('es-CO')} para crédito de ${credit.client.fullName}`,
                    entityType: 'Payment',
                    entityId: payment.id,
                    oldValues: { remainingBalance: credit.remainingBalance },
                    newValues: { remainingBalance: newRemaining, paymentAmount: amount, creditPaid: isCreditFullyPaid },
                    ipAddress: _ipAddress,
                },
            }),
        ]);

        return payment;
    }

    async registerPayment(params: {
        creditId: string;
        amount: number;
        paymentDate?: string;
        paymentMethod?: string;
        notes?: string;
        scheduleId?: string;
        accountId?: string;
        excessAction?: 'next_cuota' | 'donate';
        userId: string;
        role: UserRole;
        ipAddress?: string;
    }) {
        const { creditId, amount, paymentDate, paymentMethod, notes, scheduleId, accountId, excessAction, userId, role, ipAddress } = params;
        // paymentDate llega como "YYYY-MM-DD" (datepicker / todayBogota). new Date(str) lo
        // interpretaría como UTC medianoche = día anterior 19:00 en Bogotá. normalizeToNoon lo
        // ancla al mediodía Bogotá, evitando el off-by-one en assertDayOpen y en las
        // comparaciones de vencimiento (s.dueDate < payDate).
        const payDate = normalizeToNoon(paymentDate);
        if (payDate > normalizeToNoon()) throw new Error('La fecha de pago no puede ser futura');

        // Bloqueo de día cerrado (cierre de caja)
        const creditBiz = await prisma.credit.findUnique({ where: { id: creditId }, select: { businessId: true } });
        if (creditBiz) await accountService.assertDayOpen(creditBiz.businessId, payDate);

        return prisma.$transaction(async (tx) => {
            return this.applyPaymentTx(tx, {
                creditId,
                amount,
                payDate,
                paymentMethod,
                notes,
                scheduleId,
                accountId,
                excessAction,
                userId,
                role,
                ipAddress,
            });
        }, {
            // Margen para conexiones cross-region / cold starts de serverless.
            maxWait: 10000,   // espera máx. por una conexión del pool
            timeout: 20000,   // tiempo máx. de la transacción interactiva
        });
    }

    private calculatePaymentDistribution(
        amount: number,
        schedules: {
            id: string;
            dueDate: Date;
            scheduledAmount: Prisma.Decimal;
            paidAmount: Prisma.Decimal;
            status: string;
        }[],
        payDate: Date
    ) {
        let remaining = amount;
        const affectedSchedules: {
            id: string;
            applied: number;
            newPaidAmount: number;
            newStatus: 'paid' | 'partial' | 'overdue';
        }[] = [];

        const sorted = [...schedules].sort((a, b) => {
            const aOverdue = a.dueDate < payDate ? 1 : 0;
            const bOverdue = b.dueDate < payDate ? 1 : 0;
            if (aOverdue !== bOverdue) return bOverdue - aOverdue;
            return a.dueDate.getTime() - b.dueDate.getTime();
        });

        for (const s of sorted) {
            if (remaining <= 0) break;
            const pending = Number(s.scheduledAmount) - Number(s.paidAmount);
            if (pending <= 0) continue;
            const apply = Math.min(remaining, pending);
            const newPaid = Number(s.paidAmount) + apply;
            const newStatus =
                newPaid >= Number(s.scheduledAmount) ? 'paid'
                    : s.dueDate < payDate ? 'overdue'
                        : 'partial';
            affectedSchedules.push({ id: s.id, applied: apply, newPaidAmount: newPaid, newStatus });
            remaining -= apply;
        }

        return { affectedSchedules };
    }

    async updateCreditSchedule(
        params: {
            creditId: string;
            schedules: { id?: string; dueDate: string; scheduledAmount: number; installmentNumber?: number }[];
            userId: string;
            role: UserRole;
            amount?: number;
            interestRate?: number;
            termDays?: number;
            frequency?: PaymentFrequency;
            startDate?: string;
        }
    ) {
        const { creditId, schedules, userId, role, amount, interestRate, termDays, frequency, startDate } = params;

        if (role !== 'super_admin' && role !== 'admin') throw new Error('No tiene permisos para editar créditos');

        const credit = await prisma.credit.findUnique({
            where: { id: creditId },
            include: { paymentSchedule: true, payments: true, client: true },
        });
        if (!credit) throw new Error('Crédito no encontrado');

        const hasPaid = credit.paymentSchedule.some((s) => Number(s.paidAmount) > 0);
        if (schedules.length !== credit.paymentSchedule.length && hasPaid) {
            throw new Error('No puedes cambiar el número de cuotas porque existen pagos registrados');
        }

        const map = new Map(credit.paymentSchedule.map((s) => [s.id, s]));
        let totalScheduled = 0;
        let totalPaid = 0;

        for (const s of credit.paymentSchedule) { totalPaid += Number(s.paidAmount); }

        const now = new Date();
        let updates: {
            id?: string;
            dueDate: Date;
            scheduledAmount: number;
            status: string;
            paidAmount: number;
            installmentNumber: number;
        }[];

        if (schedules.length !== credit.paymentSchedule.length && !hasPaid) {
            updates = schedules.map((incoming, idx) => {
                const paidAmount = 0;
                const due = normalizeToNoon(incoming.dueDate);
                const status = incoming.scheduledAmount <= paidAmount ? 'paid' : due < now ? 'overdue' : 'pending';
                totalScheduled += incoming.scheduledAmount;
                return { id: incoming.id, dueDate: due, scheduledAmount: incoming.scheduledAmount, status, paidAmount, installmentNumber: incoming.installmentNumber ?? idx + 1 };
            });
        } else {
            updates = schedules.map((incoming, idx) => {
                const current = incoming.id ? map.get(incoming.id) : undefined;
                if (!current) throw new Error('Una de las cuotas no pertenece al crédito');
                const pendingPaid = Number(current.paidAmount);
                if (incoming.scheduledAmount < pendingPaid) throw new Error('El monto de una cuota no puede ser menor a lo ya pagado');
                totalScheduled += incoming.scheduledAmount;
                const due = normalizeToNoon(incoming.dueDate);
                const newStatus = incoming.scheduledAmount <= pendingPaid ? 'paid' : due < now ? 'overdue' : 'pending';
                return { id: incoming.id, dueDate: due, scheduledAmount: incoming.scheduledAmount, status: newStatus, paidAmount: pendingPaid, installmentNumber: incoming.installmentNumber ?? current.installmentNumber ?? idx + 1 };
            });
        }

        const newRemaining = totalScheduled - totalPaid;
        if (newRemaining < 0) throw new Error('Los pagos existentes superan el nuevo total del crédito');

        // ── Blindaje de integridad del schedule ──
        // Si NO se están cambiando los términos del crédito (amount/interestRate/termDays),
        // la suma de las cuotas DEBE seguir cuadrando con el total del crédito. Esto evita
        // que el editor infle el schedule silenciosamente (bug que dejó cuotas descuadradas).
        const cambiaTerminos = amount !== undefined || interestRate !== undefined || termDays !== undefined;
        if (!cambiaTerminos) {
            const totalEsperado = Number(credit.totalWithInterest);
            if (Math.abs(totalScheduled - totalEsperado) > 1) {
                throw new Error(
                    `La suma de las cuotas ($${Math.round(totalScheduled).toLocaleString('es-CO')}) no coincide ` +
                    `con el total del crédito ($${Math.round(totalEsperado).toLocaleString('es-CO')}). ` +
                    `Ajusta los montos para que sumen exactamente el total, o modifica los términos del crédito.`
                );
            }
        }

        const anyOverdue = updates.some((u) => u.status === 'overdue');
        const newStatus = newRemaining <= 0 ? 'paid' : anyOverdue ? 'overdue' : 'active';

        await prisma.$transaction(async (tx) => {
            if (schedules.length !== credit.paymentSchedule.length && !hasPaid) {
                await tx.paymentSchedule.deleteMany({ where: { creditId } });
                for (const u of updates) {
                    await tx.paymentSchedule.create({
                        data: {
                            creditId,
                            installmentNumber: u.installmentNumber,
                            dueDate: u.dueDate,
                            scheduledAmount: new Prisma.Decimal(u.scheduledAmount),
                            paidAmount: new Prisma.Decimal(u.paidAmount),
                            status: u.status as any,
                        },
                    });
                }
            } else {
                for (const u of updates) {
                    await tx.paymentSchedule.update({
                        where: { id: u.id },
                        data: {
                            dueDate: u.dueDate,
                            scheduledAmount: new Prisma.Decimal(u.scheduledAmount),
                            status: u.status as any,
                        },
                    });
                }
            }

            let endDate;
            if (startDate && termDays) {
                endDate = calculateEndDate(new Date(startDate), termDays);
            } else if (startDate && credit.termDays) {
                endDate = calculateEndDate(new Date(startDate), credit.termDays);
            } else if (credit.startDate && termDays) {
                endDate = calculateEndDate(new Date(credit.startDate), termDays);
            }

            const dataToUpdate: any = {
                remainingBalance: new Prisma.Decimal(newRemaining),
                status: newStatus,
                totalWithInterest: new Prisma.Decimal(totalScheduled),
                ...(amount !== undefined && { amount: new Prisma.Decimal(amount) }),
                ...(interestRate !== undefined && { interestRate: new Prisma.Decimal(interestRate) }),
                ...(termDays !== undefined && { termDays }),
                ...(frequency !== undefined && { paymentFrequency: frequency }),
                ...(startDate !== undefined && { startDate: new Date(startDate) }),
                ...(endDate !== undefined && { endDate }),
            };

            await tx.credit.update({
                where: { id: creditId },
                data: dataToUpdate,
            });

            await tx.auditLog.create({
                data: {
                    userId,
                    businessId: credit.businessId,
                    action: 'UPDATE_CREDIT_SCHEDULE',
                    entityType: 'Credit',
                    entityId: credit.id,
                    description: `Editó el plan de pagos del crédito ${credit.id.slice(0, 8)}... (Cliente: ${credit.client?.fullName || 'N/A'}). Modificó ${schedules.length} cuotas.`,
                    oldValues: {
                        scheduleCount: credit.paymentSchedule.length,
                        totalScheduled: credit.paymentSchedule.reduce((sum, s) => sum + Number(s.scheduledAmount), 0),
                        remainingBalance: Number(credit.remainingBalance),
                        status: credit.status,
                    },
                    newValues: { scheduleCount: schedules.length, totalScheduled, remainingBalance: newRemaining, status: newStatus },
                },
            });
        });

        const refreshed = await prisma.credit.findUnique({
            where: { id: creditId },
            include: { client: true, paymentSchedule: { orderBy: { dueDate: 'asc' } }, payments: { orderBy: { paymentDate: 'desc' } } },
        });
        if (!refreshed) throw new Error('No se pudo actualizar el crédito');
        return refreshed;
    }

    /**
     * Lógica reutilizable de cancelación de crédito (soft-cancel).
     * Debe llamarse DENTRO de una $transaction existente (`tx`).
     * - Revierte cada pago a la cuenta donde entró.
     * - Devuelve el capital a la cuenta de origen del desembolso.
     * - Actualiza business.currentBalance en una sola operación.
     * - Marca el crédito como `cancelled` (no lo borra).
     */
    private async cancelCreditTx(
        tx: Prisma.TransactionClient,
        creditId: string,
        userId: string,
        ipAddress: string
    ): Promise<{ revertedAmount: number }> {
        const credit = await tx.credit.findUnique({
            where: { id: creditId },
            include: {
                business: { select: { id: true, currentBalance: true } },
                client:   { select: { fullName: true } },
                payments: {
                    select: {
                        id: true,
                        amount: true,
                        accountId: true,
                        account: { select: { name: true } },
                    },
                    orderBy: { paymentDate: 'asc' },
                },
                paymentSchedule: { select: { id: true } },
            },
        });
        if (!credit) throw new Error('Crédito no encontrado');
        if (credit.status === 'cancelled') throw new Error('El crédito ya fue cancelado');

        const businessId = credit.business.id;
        const principal = Number(credit.amount);

        // ── 1. Resolver las cuentas de origen del desembolso (puede ser 1 o N por reparto)
        const disbMovements = await tx.cashMovement.findMany({
            where: { relatedCreditId: creditId, type: 'loan_disbursement' },
            select: { accountId: true, amount: true, account: { select: { name: true } } },
        });

        // Fallback legacy: si no hay movimientos de desembolso (créditos pre-multi-cuenta)
        if (disbMovements.length === 0) {
            const defAcc = await tx.paymentAccount.findFirst({
                where: { businessId, active: true },
                orderBy: [{ isDisbursementDefault: 'desc' }, { isDefault: 'desc' }, { name: 'asc' }],
                select: { id: true, name: true },
            });
            if (!defAcc) {
                throw new Error('No se puede cancelar el crédito: no hay cuentas activas en el negocio para devolver el capital');
            }
            disbMovements.push({
                accountId: defAcc.id,
                amount: new Prisma.Decimal(principal),
                account: { name: defAcc.name },
            } as any);
        }

        // ── 2. Revertir cada pago a la cuenta donde entró ───────────────────────
        let balanceDelta = 0;
        const movementIdsToUpdate: string[] = [];  // IDs de movimientos creados con balanceAfter=0

        // Necesitamos una cuenta fallback para pagos sin accountId
        const firstDisbAccountId   = disbMovements[0]?.accountId ?? null;
        const firstDisbAccountName = disbMovements[0]?.account?.name ?? 'Efectivo';

        for (const payment of credit.payments) {
            const payAmt    = Number(payment.amount);
            const payAccId  = payment.accountId  ?? firstDisbAccountId;
            const payAccName = payment.account?.name ?? firstDisbAccountName;

            const rev = await tx.cashMovement.create({
                data: {
                    businessId,
                    type: 'payment_reversion',
                    amount:      new Prisma.Decimal(payAmt),
                    balanceAfter: new Prisma.Decimal(0), // se actualiza al final con IDs concretos
                    description: `Reversión (cancelación crédito) - ${credit.client.fullName}`,
                    relatedCreditId: creditId,
                    paymentMethod: payAccName,
                    accountId:    payAccId ?? undefined,
                    createdById:  userId,
                },
                select: { id: true },
            });
            movementIdsToUpdate.push(rev.id);
            balanceDelta -= payAmt;
        }

        // Resetear todas las cuotas a paidAmount=0/pending
        await tx.paymentSchedule.updateMany({
            where: { creditId },
            data:  { paidAmount: new Prisma.Decimal(0), status: 'pending' },
        });

        // ── 2b. Eliminar la reclasificación de ganancia al saldar ────────────────────
        // El interest_earned de cierre (SIN relatedPaymentId) tiene efecto-caja CERO en la
        // reconstrucción de saldos, así que borrarlo no altera ningún balance; pero seguiría
        // contando como ganancia realizada en el dashboard para un crédito ya cancelado.
        // Las donaciones (interest_earned CON relatedPaymentId) NO se tocan: su efecto de caja
        // queda neutralizado por las reversiones de pago de arriba.
        await tx.cashMovement.deleteMany({
            where: { relatedCreditId: creditId, type: 'interest_earned', relatedPaymentId: null },
        });

        // ── 3. Devolver capital a cada cuenta de origen según su porción ─────────────
        const startDateStr = credit.startDate
            ? new Date(credit.startDate).toLocaleDateString('es-CO', { timeZone: 'America/Bogota', day: '2-digit', month: '2-digit', year: 'numeric' })
            : '—';

        for (const disb of disbMovements) {
            const portion = Number(disb.amount);
            const accId   = disb.accountId ?? undefined;
            const accName = disb.account?.name ?? 'Efectivo';
            balanceDelta += portion;

            const canc = await tx.cashMovement.create({
                data: {
                    businessId,
                    type:        'credit_cancellation',
                    amount:      new Prisma.Decimal(portion),
                    balanceAfter: new Prisma.Decimal(0), // se actualiza al final con IDs concretos
                    description: `Cancelación crédito #${creditId.slice(0, 8)} | Cliente: ${credit.client.fullName} | Apertura: ${startDateStr}`,
                    relatedCreditId:  creditId,
                    paymentMethod:   accName,
                    accountId:       accId,
                    createdById:     userId,
                },
                select: { id: true },
            });
            movementIdsToUpdate.push(canc.id);
        }

        // ── 4. Un solo update del saldo del negocio ──────────────────────────────
        const newBalance = new Prisma.Decimal(credit.business.currentBalance).plus(balanceDelta);
        await tx.business.update({
            where: { id: businessId },
            data:  { currentBalance: newBalance },
        });

        // Actualizar balanceAfter con IDs concretos (seguro y determinista)
        await tx.cashMovement.updateMany({
            where: { id: { in: movementIdsToUpdate } },
            data:  { balanceAfter: newBalance },
        });

        // ── 5. Soft-cancel del crédito ───────────────────────────────────────────
        await tx.credit.update({
            where: { id: creditId },
            data:  {
                status:         'cancelled',
                remainingBalance: new Prisma.Decimal(credit.totalWithInterest),
                completionDate: null,
                earnedInterest: null,
            },
        });

        // ── 6. Auditoría ─────────────────────────────────────────────────────────
        await tx.auditLog.create({
            data: {
                userId,
                businessId,
                action:      'CANCEL_CREDIT',
                description: `Cancelación de crédito de ${credit.client.fullName} | Capital $${principal.toLocaleString('es-CO')} devuelto a ${disbMovements.map(d => d.account?.name ?? 'Efectivo').join(', ')}${credit.payments.length > 0 ? ` | ${credit.payments.length} pago(s) revertidos` : ''}`,
                entityType:  'Credit',
                entityId:    creditId,
                oldValues:   { status: credit.status, remainingBalance: credit.remainingBalance, paymentsCount: credit.payments.length },
                newValues:   { status: 'cancelled', revertedCapital: principal, balanceDelta },
                ipAddress,
            },
        });

        return { revertedAmount: principal };
    }

    async bulkDeleteCredits(creditIds: string[], requestingUserId: string, userRole: UserRole, ipAddress: string = '') {
        if (userRole === 'user') throw new Error('No tiene permisos para cancelar créditos en lote');

        // Verificar que los créditos existen
        const creditsToCancel = await prisma.credit.findMany({
            where: { id: { in: creditIds }, status: { not: 'cancelled' } },
            select: { id: true, businessId: true, client: { select: { fullName: true } } },
        });

        if (creditsToCancel.length === 0) return { message: 'No se encontraron créditos activos para cancelar', cancelledCount: 0 };

        if (userRole === 'admin') {
            const userBusinessId = await this.getUserBusiness(requestingUserId);
            const invalid = creditsToCancel.filter(c => c.businessId !== userBusinessId);
            if (invalid.length > 0) throw new Error('No tiene permisos para cancelar uno o más créditos seleccionados');
        }

        // La cancelación crea movimientos de caja HOY; bloquear si el día está cerrado en
        // alguno de los negocios involucrados.
        const businessIdsToCheck = [...new Set(creditsToCancel.map(c => c.businessId))];
        for (const bId of businessIdsToCheck) {
            await accountService.assertDayOpen(bId, new Date());
        }

        // Cancelar cada crédito en una única transacción
        const results = await prisma.$transaction(
            async (tx) => {
                const outcomes: Array<{ id: string; ok: boolean; error?: string }> = [];
                for (const c of creditsToCancel) {
                    try {
                        await this.cancelCreditTx(tx, c.id, requestingUserId, ipAddress);
                        outcomes.push({ id: c.id, ok: true });
                    } catch (err: any) {
                        outcomes.push({ id: c.id, ok: false, error: err.message });
                    }
                }
                return outcomes;
            },
            { timeout: 30_000 }
        );

        const cancelled = results.filter(r => r.ok).length;
        const errors    = results.filter(r => !r.ok);

        return {
            message: `${cancelled} crédito(s) cancelado(s)${errors.length > 0 ? `; ${errors.length} con error` : ''}`,
            cancelledCount: cancelled,
            errors,
        };
    }

    async deleteCredit(creditId: string, userId: string, role: UserRole, ipAddress: string = '') {
        if (role !== 'super_admin') {
            throw new Error('Solo el Super Admin puede cancelar créditos');
        }

        const exists = await prisma.credit.findUnique({ where: { id: creditId }, select: { id: true, amount: true, businessId: true } });
        if (!exists) throw new Error('Crédito no encontrado');

        // La cancelación crea movimientos de caja HOY; bloquear si el día está cerrado.
        await accountService.assertDayOpen(exists.businessId, new Date());

        const result = await prisma.$transaction(
            async (tx) => this.cancelCreditTx(tx, creditId, userId, ipAddress),
            { timeout: 20_000 }
        );

        return { success: true, revertedAmount: result.revertedAmount };
    }

    async revertInstallment(
        creditId: string,
        scheduleId: string,
        amountToRevert: number,
        userId: string,
        role: UserRole,
        ipAddress = ''
    ) {
        if (role !== 'super_admin') throw new Error('No tiene permisos para revertir cuotas. Solo Super Admin.');
        if (amountToRevert <= 0) throw new Error('El monto a revertir debe ser mayor a cero');

        return await prisma.$transaction(async (tx) => {
            const schedule = await tx.paymentSchedule.findUnique({
                where: { id: scheduleId, creditId },
                include: { credit: { include: { business: true } } },
            });

            if (!schedule) throw new Error('Cuota no encontrada');

            // No permitir revertir cuotas de créditos ya pagados — el crédito quedaría en estado inconsistente
            if (schedule.credit.status === 'paid') {
                throw new Error(
                    'No se puede revertir una cuota de un crédito ya completamente pagado. ' +
                    'Si hubo un error, cancela el crédito y regístralo nuevamente.'
                );
            }

            // Usar Math.ceil como umbral para alinear con el redondeo de la UI (siempre muestra
            // y envía Math.ceil del paidAmount). Sin esto, pagar/revertir un decimal como 153333,33
            // comparado contra el ceileado 153334 lanzaba un falso "excede el monto pagado".
            const paidAmountCeil = Math.ceil(Number(schedule.paidAmount));
            if (amountToRevert > paidAmountCeil + 0.01) {
                throw new Error(`El monto a revertir ($${amountToRevert}) excede el monto pagado de la cuota ($${paidAmountCeil})`);
            }

            // La reversión crea un movimiento de caja HOY; bloquear si el día está cerrado.
            await accountService.assertDayOpen(schedule.credit.businessId, new Date());

            const business = schedule.credit.business;
            const credit = schedule.credit;

            // 1. Actualizar la cuota — clampear a ≥ 0 por si amountToRevert supera levemente
            //    el paidAmount decimal (diferencia de redondeo, máx 1 peso).
            const newPaidAmount = new Prisma.Decimal(Math.max(0, Number(schedule.paidAmount) - amountToRevert));
            const isPastDue = schedule.dueDate < new Date();
            const newStatus = Number(newPaidAmount) <= 0
                ? (isPastDue ? 'overdue' : 'pending')
                : (isPastDue ? 'overdue' : 'partial');

            await tx.paymentSchedule.update({
                where: { id: scheduleId },
                data: {
                    paidAmount: newPaidAmount,
                    status: newStatus
                }
            });

            // 2. Actualizar el crédito
            const newRemaining = new Prisma.Decimal(credit.remainingBalance).plus(amountToRevert);

            // Determinar nuevo estado: si la cuota revertida u otra está overdue, el crédito queda overdue
            const overdueCount = await tx.paymentSchedule.count({
                where: { creditId, status: 'overdue' }
            });
            const newCreditStatus = (newStatus === 'overdue' || overdueCount > 0) ? 'overdue' : 'active';

            await tx.credit.update({
                where: { id: creditId },
                data: {
                    remainingBalance: newRemaining,
                    status: newCreditStatus,
                    completionDate: null,
                    earnedInterest: null
                }
            });

            // 3. Compensar la Caja
            // Resolver la cuenta donde entró el pago (para revertir desde la misma cuenta)
            const originalPayment = await tx.payment.findFirst({
                where: { creditId, scheduleId },
                orderBy: { paymentDate: 'desc' },
                select: { accountId: true, account: { select: { name: true } } },
            });
            const revertAccountId   = originalPayment?.accountId ?? null;
            const revertAccountName = originalPayment?.account?.name ?? 'Efectivo';

            const newBalance = new Prisma.Decimal(business.currentBalance).minus(amountToRevert);
            await tx.cashMovement.create({
                data: {
                    businessId: business.id,
                    type: 'payment_reversion' as any,
                    amount: new Prisma.Decimal(amountToRevert),
                    balanceAfter: newBalance,
                    description: `Reversión en cuota #${schedule.installmentNumber} del crédito ${credit.id.slice(0, 8)}`,
                    paymentMethod: revertAccountName,
                    accountId:    revertAccountId ?? undefined,
                    createdById:  userId,
                    relatedCreditId: creditId,
                },
            });

            await tx.business.update({
                where: { id: business.id },
                data: { currentBalance: newBalance }
            });

            // 4. Auditoría
            await tx.auditLog.create({
                data: {
                    userId,
                    businessId: business.id,
                    action: 'REVERT_PAYMENT_INSTALLMENT',
                    description: `Reversión de $${amountToRevert.toLocaleString('es-CO')} en cuota #${schedule.installmentNumber}`,
                    entityType: 'PaymentSchedule',
                    entityId: scheduleId,
                    oldValues: { paidAmount: schedule.paidAmount, remainingBalance: credit.remainingBalance },
                    newValues: { paidAmount: newPaidAmount, remainingBalance: newRemaining },
                    ipAddress
                }
            });

            return { success: true, newPaidAmount, newRemaining };
        });
    }
}

export const creditService = new CreditService();
