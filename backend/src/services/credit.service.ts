import { Prisma, UserRole } from '@prisma/client';
import prisma from '../config/database';
import { calculateCreditPlan, calculateEndDate } from '../utils/calculations';

export type PaymentFrequency = 'daily' | 'weekly' | 'biweekly' | 'monthly';

interface CreateCreditInput {
    clientId: string;
    businessId?: string;
    amount: number;
    interestRate: number;
    termDays: number;
    frequency: PaymentFrequency;
    startDate?: string;
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
        if (!dateStr) return new Date();
        // dateStr usually comes as YYYY-MM-DD
        // By adding T12:00:00-05:00 we force the time to be Noon in Colombia
        // This prevents the date from shifting to the previous day when converted to UTC
        const formatted = dateStr.includes('T') ? dateStr : `${dateStr}T12:00:00.000-05:00`;
        return new Date(formatted);
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

        if (role === 'user') {
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

        if (role === 'user') {
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
        userId: string;
        role: UserRole;
        ipAddress?: string;
    }) {
        const { creditId, amount, paymentDate, paymentMethod, notes, scheduleId, userId, role, ipAddress } = params;
        const payDate = paymentDate ? new Date(paymentDate) : new Date();
        if (payDate > new Date()) throw new Error('La fecha de pago no puede ser futura');

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

            if (role === 'user') {
                const userBusinessId = await this.getUserBusiness(userId);
                if (!userBusinessId || userBusinessId !== credit.businessId) {
                    throw new Error('No tiene permisos para operar este crédito');
                }
            }

            if (credit.status === 'paid') throw new Error('El crédito ya está pagado');
            if (amount <= 0) throw new Error('El monto debe ser mayor a 0');

            const currentRemaining = Number(credit.remainingBalance);

            // Determinar cuánto va al crédito y cuánto es excedente (ganancias)
            const appliedAmount = Math.min(amount, currentRemaining);
            const excessAmount = Math.max(0, amount - currentRemaining);

            if (scheduleId) {
                // ── Pago con cuota específica: soporta monto mayor o menor ──
                const target = credit.paymentSchedule.find((s) => s.id === scheduleId);
                if (!target) throw new Error('La cuota seleccionada no pertenece a este crédito');
                const scheduledPending = Number(target.scheduledAmount) - Number(target.paidAmount);
                if (scheduledPending <= 0) throw new Error('La cuota ya está pagada');

                const newPaid = Number(target.paidAmount) + appliedAmount;
                const isPaidFull = newPaid >= Number(target.scheduledAmount);

                await tx.paymentSchedule.update({
                    where: { id: scheduleId },
                    data: {
                        paidAmount: new Prisma.Decimal(Math.min(newPaid, Number(target.scheduledAmount))),
                        status: isPaidFull ? 'paid' : (target.dueDate < payDate ? 'overdue' : 'partial'),
                    },
                });

                // Diferencia: positivo = sobrepago del crédito, negativo = subpago
                const difference = appliedAmount - scheduledPending;

                if (Math.abs(difference) > 0.01) {
                    const futurePending = credit.paymentSchedule.filter(
                        (s) => s.id !== scheduleId && Number(s.scheduledAmount) - Number(s.paidAmount) > 0
                    );

                    if (futurePending.length > 0) {
                        const totalFuturePending = futurePending.reduce(
                            (sum, s) => sum + Number(s.scheduledAmount) - Number(s.paidAmount), 0
                        );
                        const newTotalFuture = totalFuturePending - difference;

                        if (newTotalFuture <= 0) {
                            // Sobrepago cubrió todo: marcar cuotas restantes como pagadas
                            for (const s of futurePending) {
                                await tx.paymentSchedule.update({
                                    where: { id: s.id },
                                    data: { paidAmount: s.scheduledAmount, status: 'paid' },
                                });
                            }
                        } else {
                            // Redistribuir balance restante entre cuotas futuras en partes iguales
                            const perInstallment = Math.ceil(newTotalFuture / futurePending.length);
                            for (let i = 0; i < futurePending.length; i++) {
                                const s = futurePending[i];
                                const newScheduled = i === futurePending.length - 1
                                    ? Math.max(1, newTotalFuture - perInstallment * (futurePending.length - 1))
                                    : perInstallment;
                                const due = new Date(s.dueDate);
                                const newStatus =
                                    Number(s.paidAmount) >= newScheduled ? 'paid'
                                        : due < payDate ? 'overdue'
                                            : 'pending';
                                await tx.paymentSchedule.update({
                                    where: { id: s.id },
                                    data: {
                                        scheduledAmount: new Prisma.Decimal(newScheduled),
                                        status: newStatus,
                                    },
                                });
                            }
                        }
                    }
                }
            } else {
                // ── Sin cuota específica: distribución automática ──
                const distribution = this.calculatePaymentDistribution(appliedAmount, credit.paymentSchedule, payDate);
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

            const newRemaining = new Prisma.Decimal(currentRemaining).minus(appliedAmount);
            const isCreditFullyPaid = Number(newRemaining) <= 0;

            const anyOverdue = await tx.paymentSchedule.count({ where: { creditId, status: 'overdue' } });
            const creditStatus = isCreditFullyPaid ? 'paid' : anyOverdue > 0 ? 'overdue' : 'active';

            // ── Registrar pago ──
            const payment = await tx.payment.create({
                data: {
                    creditId,
                    amount: new Prisma.Decimal(amount),
                    paymentDate: payDate,
                    amountToPrincipal: new Prisma.Decimal(appliedAmount),
                    amountToInterest: new Prisma.Decimal(0),
                    remainingBalanceAfter: newRemaining,
                    paymentMethod,
                    notes,
                    createdById: userId,
                },
            });

            // ── Caja: entrada del pago recibido ──
            const newBusinessBalance = new Prisma.Decimal(credit.business.currentBalance).plus(amount);
            await tx.cashMovement.create({
                data: {
                    businessId: credit.businessId,
                    type: 'payment_received',
                    amount: new Prisma.Decimal(amount),
                    balanceAfter: newBusinessBalance,
                    description: `Pago crédito ${credit.id.slice(0, 8)} - ${credit.client.fullName}`,
                    relatedCreditId: credit.id,
                    relatedPaymentId: payment.id,
                    createdById: userId,
                },
            });

            await tx.business.update({
                where: { id: credit.businessId },
                data: { currentBalance: newBusinessBalance },
            });

            await tx.credit.update({
                where: { id: creditId },
                data: { remainingBalance: newRemaining, status: creditStatus },
            });

            // ── Si el crédito se paga completamente: calcular y registrar ganancia ──
            if (isCreditFullyPaid) {
                const allPayments = await tx.payment.findMany({
                    where: { creditId },
                    select: { amount: true },
                });
                const totalPaid = allPayments.reduce((sum, p) => sum + Number(p.amount), 0);
                const originalAmount = Number(credit.amount);
                const profit = totalPaid - originalAmount;

                if (profit > 0) {
                    // Registrar la ganancia como movimiento de caja separado (informativo)
                    await tx.cashMovement.create({
                        data: {
                            businessId: credit.businessId,
                            type: 'interest_earned',
                            amount: new Prisma.Decimal(profit),
                            balanceAfter: newBusinessBalance, // ya incluido en el pago
                            description: `Ganancia crédito pagado - ${credit.client.fullName} | Capital: $${originalAmount.toLocaleString('es-CO')} | Total cobrado: $${totalPaid.toLocaleString('es-CO')}`,
                            relatedCreditId: credit.id,
                            createdById: userId,
                        },
                    });
                }

                // Si pagó de más (exceso sobre el total del crédito)
                if (excessAmount > 0) {
                    await tx.cashMovement.create({
                        data: {
                            businessId: credit.businessId,
                            type: 'interest_earned',
                            amount: new Prisma.Decimal(excessAmount),
                            balanceAfter: newBusinessBalance,
                            description: `Excedente de pago crédito - ${credit.client.fullName}`,
                            relatedCreditId: credit.id,
                            createdById: userId,
                        },
                    });
                }
            }

            await tx.auditLog.create({
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
            });

            return payment;
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
        creditId: string,
        schedules: { id?: string; dueDate: string; scheduledAmount: number; installmentNumber?: number }[],
        userId: string,
        role: UserRole
    ) {
        if (role !== 'super_admin') throw new Error('No tiene permisos para editar créditos');

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

            await tx.credit.update({
                where: { id: creditId },
                data: { remainingBalance: new Prisma.Decimal(newRemaining), status: newStatus },
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
}

export const creditService = new CreditService();
