import { Prisma, UserRole } from '@prisma/client';
import prisma from '../config/database';
import { calculateCreditPlan, calculateEndDate } from '../utils/calculations';
import { normalizeToNoon } from '../utils/dates';
import { accountService } from './account.service';

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
}

interface ListFilters {
    businessId?: string;
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
        const plan = calculateCreditPlan(
            data.amount,
            data.interestRate,
            start,
            data.termDays,
            data.frequency
        );
        return { ...plan, endDate: calculateEndDate(start, data.termDays) };
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
        if (Number(business.currentBalance) < data.amount) throw new Error('El monto excede el saldo disponible en caja');

        // Resolver cuenta de desembolso
        let disbursementAccountId: string;
        let disbursementAccountName: string;

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
                // Crear la cuenta Efectivo por defecto
                disbursementAccountId = await accountService.ensureDefaultAccount(targetBusinessId, userId);
                disbursementAccountName = 'Efectivo';
            } else {
                disbursementAccountId   = defAcc.id;
                disbursementAccountName = defAcc.name;
            }
        }

        // Validar saldo de la cuenta de desembolso
        const { accounts: accBalances } = await accountService.getBalances(targetBusinessId, userId, role);
        const accBalance = accBalances.find(a => a.id === disbursementAccountId);
        const available = accBalance?.balance ?? 0;
        if (available < data.amount) {
            const err: any = new Error(`Saldo insuficiente en la cuenta "${disbursementAccountName}" ($${available.toLocaleString('es-CO')} disponible, se necesitan $${data.amount.toLocaleString('es-CO')})`);
            err.code    = 'INSUFFICIENT_ACCOUNT_BALANCE';
            err.details = { accountId: disbursementAccountId, accountName: disbursementAccountName, available, required: data.amount };
            throw err;
        }

        const simulation = await this.simulateCredit(data);

        const result = await prisma.$transaction(async (tx) => {
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

            const newBalance = new Prisma.Decimal(business.currentBalance).minus(data.amount);
            await tx.cashMovement.create({
                data: {
                    businessId: targetBusinessId,
                    type: 'loan_disbursement',
                    amount: new Prisma.Decimal(data.amount),
                    balanceAfter: newBalance,
                    description: `Desembolso crédito a ${client.fullName}`,
                    relatedCreditId: credit.id,
                    paymentMethod: disbursementAccountName,
                    accountId: disbursementAccountId,
                    createdById: userId,
                },
            });

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
                    newValues: { credit, scheduleCount: simulation.paymentPlan.length },
                    ipAddress,
                },
            });

            return credit;
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
            ...(filters.status && { status: filters.status as any }),
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
                        { paymentSchedule: { some: { dueDate: { lt: startOfBogotaToday }, status: 'pending' } } }
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
        const payDate = paymentDate ? new Date(paymentDate) : new Date();
        if (payDate > new Date()) throw new Error('La fecha de pago no puede ser futura');

        // Bloqueo de día cerrado (cierre de caja)
        const creditBiz = await prisma.credit.findUnique({ where: { id: creditId }, select: { businessId: true } });
        if (creditBiz) await accountService.assertDayOpen(creditBiz.businessId, payDate);

        return prisma.$transaction(async (tx) => {
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
                        ipAddress,
                    },
                }),
            ]);

            return payment;
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
                const due = new Date(incoming.dueDate);
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
                const due = new Date(incoming.dueDate);
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

    async bulkDeleteCredits(creditIds: string[], requestingUserId: string, userRole: UserRole, ipAddress: string = '') {
        if (userRole === 'user') throw new Error('No tiene permisos para eliminar créditos en lote');

        const creditsToDelete = await prisma.credit.findMany({
            where: { id: { in: creditIds } },
            include: { client: { select: { fullName: true } } }
        });

        if (creditsToDelete.length === 0) return { message: 'No se encontraron créditos para eliminar', deletedCount: 0 };

        if (userRole === 'admin') {
            const userBusinessId = await this.getUserBusiness(requestingUserId);
            const invalidCredits = creditsToDelete.filter(c => c.businessId !== userBusinessId);
            if (invalidCredits.length > 0) throw new Error('No tiene permisos para eliminar uno o más créditos seleccionados');
        }

        const validIds = creditsToDelete.map(c => c.id);
        const { count } = await prisma.credit.deleteMany({ where: { id: { in: validIds } } });

        const auditLogs = creditsToDelete.map(c => ({
            userId: requestingUserId,
            businessId: c.businessId,
            action: 'BULK_DELETE_CREDIT',
            description: `Eliminación en lote: crédito del cliente '${c.client?.fullName}' por $${c.amount}`,
            entityType: 'Credit',
            entityId: c.id,
            ipAddress,
        }));

        await prisma.auditLog.createMany({ data: auditLogs });

        return { message: `Se eliminaron ${count} créditos exitosamente`, deletedCount: count };
    }
    async deleteCredit(creditId: string, userId: string, role: UserRole, ipAddress: string = '') {
        if (role !== 'super_admin') {
            throw new Error('Solo el Super Admin puede eliminar créditos completos');
        }

        const credit = await prisma.credit.findUnique({
            where: { id: creditId },
            include: {
                business: { select: { id: true, currentBalance: true } },
                client: { select: { fullName: true } },
                payments: { select: { id: true } }
            }
        });

        if (!credit) throw new Error('Crédito no encontrado');

        // Validar: si el crédito tiene pagos registrados, no permitir eliminación directa.
        // El admin debe revertir los pagos primero (usando revertInstallment) para mantener
        // la consistencia del balance de caja.
        if (credit.payments.length > 0) {
            throw new Error(
                `No se puede eliminar el crédito porque tiene ${credit.payments.length} pago(s) registrado(s). ` +
                `Revierta los pagos individualmente antes de eliminar el crédito.`
            );
        }

        const amountToRevert = Number(credit.amount);
        const businessId = credit.businessId;

        return prisma.$transaction(async (tx) => {
            // 1. Revertir balance del negocio
            const newBalance = new Prisma.Decimal(credit.business.currentBalance).plus(amountToRevert);
            await tx.business.update({
                where: { id: businessId },
                data: { currentBalance: newBalance }
            });

            // 2. Registrar movimiento de caja por cancelación
            await tx.cashMovement.create({
                data: {
                    businessId,
                    type: 'credit_cancellation',
                    amount: new Prisma.Decimal(amountToRevert),
                    balanceAfter: newBalance,
                    description: `Cancelación/Eliminación Crédito #${credit.id.slice(0, 8)} - Cliente: ${credit.client.fullName}`,
                    relatedCreditId: null, // El crédito será eliminado
                    createdById: userId,
                }
            });

            // 3. Eliminar el crédito (Prisma maneja cascada para paymentSchedule y payments)
            await tx.credit.delete({
                where: { id: creditId }
            });

            // 4. Auditoría
            await tx.auditLog.create({
                data: {
                    userId,
                    businessId,
                    action: 'DELETE_CREDIT_FULL',
                    description: `Eliminación total de crédito de ${credit.client.fullName} por $${amountToRevert.toLocaleString('es-CO')}. Capital devuelto a caja.`,
                    entityType: 'Credit',
                    entityId: creditId,
                    oldValues: { creditId, amount: amountToRevert, clientId: credit.clientId },
                    ipAddress,
                }
            });

            return { success: true, revertedAmount: amountToRevert };
        });
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
                include: { credit: { include: { business: true } } }
            });

            if (!schedule) throw new Error('Cuota no encontrada');
            // Usar Math.ceil como umbral para alinear con el redondeo de la UI (siempre muestra
            // y envía Math.ceil del paidAmount). Sin esto, pagar/revertir un decimal como 153333,33
            // comparado contra el ceileado 153334 lanzaba un falso "excede el monto pagado".
            const paidAmountCeil = Math.ceil(Number(schedule.paidAmount));
            if (amountToRevert > paidAmountCeil + 0.01) {
                throw new Error(`El monto a revertir ($${amountToRevert}) excede el monto pagado de la cuota ($${paidAmountCeil})`);
            }

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
            const newBalance = new Prisma.Decimal(business.currentBalance).minus(amountToRevert);
            await tx.cashMovement.create({
                data: {
                    businessId: business.id,
                    type: 'payment_reversion' as any, // Cast to any to avoid temporary TS sync issues
                    amount: new Prisma.Decimal(amountToRevert),
                    balanceAfter: newBalance,
                    description: `Reversión en cuota #${schedule.installmentNumber} del crédito ${credit.id.slice(0, 8)}`,
                    paymentMethod: 'efectivo',
                    createdById: userId,
                    relatedCreditId: creditId
                }
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
