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

    private normalizeDate(date?: string): Date {
        return date ? new Date(date) : new Date();
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

        return {
            ...plan,
            endDate: calculateEndDate(start, data.termDays),
        };
    }

    async createCredit(data: CreateCreditInput, userId: string, role: UserRole, ipAddress = '') {
        const isAdmin = role === 'admin' || role === 'super_admin';
        const start = this.normalizeDate(data.startDate);

        // Determinar negocio objetivo
        let targetBusinessId: string;
        if (isAdmin) {
            if (!data.businessId) {
                throw new Error('businessId es requerido para admin/super_admin');
            }
            targetBusinessId = data.businessId;
        } else {
            const userBusinessId = await this.getUserBusiness(userId);
            if (!userBusinessId) throw new Error('Usuario no tiene negocio asignado');
            targetBusinessId = userBusinessId;
        }

        // Validar cliente pertenece al negocio
        const client = await prisma.client.findUnique({
            where: { id: data.clientId },
            select: { id: true, fullName: true, businessId: true },
        });
        if (!client) throw new Error('Cliente no encontrado');
        if (client.businessId !== targetBusinessId) {
            throw new Error('El cliente no pertenece al negocio seleccionado');
        }

        // Obtener saldo del negocio
        const business = await prisma.business.findUnique({
            where: { id: targetBusinessId },
            select: { id: true, currentBalance: true, name: true },
        });
        if (!business) throw new Error('Negocio no encontrado');

        if (Number(business.currentBalance) < data.amount) {
            throw new Error('El monto excede el saldo disponible en caja');
        }

        // Simular plan
        const simulation = await this.simulateCredit(data);

        const result = await prisma.$transaction(async (tx) => {
            // Crear crédito
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
                    id: true,
                    businessId: true,
                    clientId: true,
                    amount: true,
                    interestRate: true,
                    totalWithInterest: true,
                    paymentFrequency: true,
                    startDate: true,
                    endDate: true,
                    termDays: true,
                    remainingBalance: true,
                    status: true,
                    createdById: true,
                    createdAt: true,
                    updatedAt: true,
                },
            });

            // Crear cuotas
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

            // Movimiento de caja
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

            // Actualizar saldo del negocio
            await tx.business.update({
                where: { id: targetBusinessId },
                data: { currentBalance: newBalance },
            });

            // Auditoría básica
            await tx.auditLog.create({
                data: {
                    userId,
                    businessId: targetBusinessId,
                    action: 'CREATE_CREDIT',
                    description: `Creó crédito para ${client.fullName} por ${data.amount}`,
                    entityType: 'Credit',
                    entityId: credit.id,
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
            if (!userBusinessId) {
                throw new Error('No tiene negocio asignado');
            }
            if (businessId && businessId !== userBusinessId) {
                throw new Error('No tiene permisos para ver créditos de otro negocio');
            }
            businessId = userBusinessId;
        }

        const where: Prisma.CreditWhereInput = {
            ...(businessId && { businessId }),
            ...(filters.status && { status: filters.status as any }),
        };

        if (filters.dueToday) {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const tomorrow = new Date(today);
            tomorrow.setDate(today.getDate() + 1);
            where.paymentSchedule = {
                some: {
                    dueDate: { gte: today, lt: tomorrow },
                    status: { in: ['pending', 'partial'] },
                },
            };
        }

        if (filters.overdue) {
            where.paymentSchedule = {
                some: {
                    status: 'overdue',
                },
            };
        }

        const credits = await prisma.credit.findMany({
            where,
            include: {
                client: true,
                paymentSchedule: true,
            },
            orderBy: { createdAt: 'desc' },
        });

        return credits;
    }

    async getCreditById(creditId: string, userId: string, role: UserRole) {
        const credit = await prisma.credit.findUnique({
            where: { id: creditId },
            include: {
                client: true,
                paymentSchedule: {
                    orderBy: { dueDate: 'asc' },
                },
                payments: {
                    orderBy: { paymentDate: 'desc' },
                },
            },
        });

        if (!credit) throw new Error('Crédito no encontrado');

        // Autorización
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
        if (payDate > new Date()) {
            throw new Error('La fecha de pago no puede ser futura');
        }

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
            if (Number(credit.remainingBalance) < amount) {
                throw new Error('El monto supera el saldo pendiente');
            }

            if (scheduleId) {
                const target = credit.paymentSchedule.find((s) => s.id === scheduleId);
                if (!target) throw new Error('La cuota seleccionada no pertenece a este crédito');
                const pending = Number(target.scheduledAmount) - Number(target.paidAmount);
                if (pending <= 0) throw new Error('La cuota ya está pagada');
                if (amount > pending) throw new Error('El monto supera lo pendiente en la cuota seleccionada');
                const newPaid = Number(target.paidAmount) + amount;
                const newStatus =
                    newPaid >= Number(target.scheduledAmount)
                        ? 'paid'
                        : target.dueDate < payDate
                            ? 'overdue'
                            : 'partial';

                await tx.paymentSchedule.update({
                    where: { id: scheduleId },
                    data: {
                        paidAmount: new Prisma.Decimal(newPaid),
                        status: newStatus,
                    },
                });
            } else {
                const distribution = this.calculatePaymentDistribution(amount, credit.paymentSchedule, payDate);

                let remainingPayment = amount;
                const updates: Prisma.PaymentScheduleUpdateArgs[] = [];

                for (const item of distribution.affectedSchedules) {
                    updates.push({
                        where: { id: item.id },
                        data: {
                            paidAmount: new Prisma.Decimal(item.newPaidAmount),
                            status: item.newStatus,
                        },
                    });
                    remainingPayment -= Number(item.applied);
                }

                for (const u of updates) {
                    await tx.paymentSchedule.update(u);
                }
            }

            const newRemaining = new Prisma.Decimal(credit.remainingBalance).minus(amount);

            // Determinar estado del crédito
            const anyOverdue = await tx.paymentSchedule.count({
                where: {
                    creditId,
                    status: 'overdue',
                },
            });

            const creditStatus =
                Number(newRemaining) <= 0 ? 'paid' : anyOverdue > 0 ? 'overdue' : 'active';

            // Registrar pago
            const payment = await tx.payment.create({
                data: {
                    creditId,
                    amount: new Prisma.Decimal(amount),
                    paymentDate: payDate,
                    amountToPrincipal: new Prisma.Decimal(amount),
                    amountToInterest: new Prisma.Decimal(0),
                    remainingBalanceAfter: newRemaining,
                    paymentMethod,
                    notes,
                    createdById: userId,
                },
            });

            // Movimiento de caja
            const newBusinessBalance = new Prisma.Decimal(credit.business.currentBalance).plus(amount);
            await tx.cashMovement.create({
                data: {
                    businessId: credit.businessId,
                    type: 'payment_received',
                    amount: new Prisma.Decimal(amount),
                    balanceAfter: newBusinessBalance,
                    description: `Pago de crédito ${credit.id}`,
                    relatedCreditId: credit.id,
                    relatedPaymentId: payment.id,
                    createdById: userId,
                },
            });

            // Actualizar negocio saldo
            await tx.business.update({
                where: { id: credit.businessId },
                data: { currentBalance: newBusinessBalance },
            });

            // Actualizar crédito
            await tx.credit.update({
                where: { id: creditId },
                data: {
                    remainingBalance: newRemaining,
                    status: creditStatus,
                },
            });

            // Auditoría básica
            await tx.auditLog.create({
                data: {
                    userId,
                    businessId: credit.businessId,
                    action: 'REGISTER_PAYMENT',
                    description: `Pago de ${amount} para crédito ${credit.id}`,
                    entityType: 'Payment',
                    entityId: payment.id,
                    oldValues: { remainingBalance: credit.remainingBalance },
                    newValues: { remainingBalance: newRemaining, paymentAmount: amount },
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
            if (aOverdue !== bOverdue) return bOverdue - aOverdue; // vencidos primero
            return a.dueDate.getTime() - b.dueDate.getTime();
        });

        for (const s of sorted) {
            if (remaining <= 0) break;
            const pending = Number(s.scheduledAmount) - Number(s.paidAmount);
            if (pending <= 0) continue;
            const apply = Math.min(remaining, pending);
            const newPaid = Number(s.paidAmount) + apply;
            const newStatus =
                newPaid >= Number(s.scheduledAmount)
                    ? 'paid'
                    : s.dueDate < payDate
                        ? 'overdue'
                        : 'partial';
            affectedSchedules.push({
                id: s.id,
                applied: apply,
                newPaidAmount: newPaid,
                newStatus,
            });
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
        if (role !== 'super_admin') {
            throw new Error('No tiene permisos para editar créditos');
        }

        const credit = await prisma.credit.findUnique({
            where: { id: creditId },
            include: {
                paymentSchedule: true,
                payments: true,
                client: true,
            },
        });
        if (!credit) throw new Error('Crédito no encontrado');

        const hasPaid = credit.paymentSchedule.some((s) => Number(s.paidAmount) > 0);
        if (schedules.length !== credit.paymentSchedule.length && hasPaid) {
            throw new Error('No puedes cambiar el número de cuotas porque existen pagos registrados');
        }

        const map = new Map(credit.paymentSchedule.map((s) => [s.id, s]));
        let totalScheduled = 0;
        let totalPaid = 0;

        for (const s of credit.paymentSchedule) {
            totalPaid += Number(s.paidAmount);
        }

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
            // Reemplazar todas las cuotas (solo si no hay pagos)
            updates = schedules.map((incoming, idx) => {
                const paidAmount = 0;
                const due = new Date(incoming.dueDate);
                const status =
                    incoming.scheduledAmount <= paidAmount
                        ? 'paid'
                        : due < now
                            ? 'overdue'
                            : 'pending';
                totalScheduled += incoming.scheduledAmount;
                return {
                    id: incoming.id,
                    dueDate: due,
                    scheduledAmount: incoming.scheduledAmount,
                    status,
                    paidAmount,
                    installmentNumber: incoming.installmentNumber ?? idx + 1,
                };
            });
        } else {
            updates = schedules.map((incoming, idx) => {
                const current = incoming.id ? map.get(incoming.id) : undefined;
                if (!current) throw new Error('Una de las cuotas no pertenece al crédito');
                const pendingPaid = Number(current.paidAmount);
                if (incoming.scheduledAmount < pendingPaid) {
                    throw new Error('El monto de una cuota no puede ser menor a lo ya pagado');
                }
                totalScheduled += incoming.scheduledAmount;
                const due = new Date(incoming.dueDate);
                const newStatus =
                    incoming.scheduledAmount <= pendingPaid
                        ? 'paid'
                        : due < now
                            ? 'overdue'
                            : 'pending';
                return {
                    id: incoming.id,
                    dueDate: due,
                    scheduledAmount: incoming.scheduledAmount,
                    status: newStatus,
                    paidAmount: pendingPaid,
                    installmentNumber: incoming.installmentNumber ?? current.installmentNumber ?? idx + 1,
                };
            });
        }

        const newRemaining = totalScheduled - totalPaid;
        if (newRemaining < 0) {
            throw new Error('Los pagos existentes superan el nuevo total del crédito');
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

            await tx.credit.update({
                where: { id: creditId },
                data: {
                    // No modificar el monto principal; solo el saldo restante
                    remainingBalance: new Prisma.Decimal(newRemaining),
                    status: newStatus,
                },
            });

            await tx.auditLog.create({
                data: {
                    userId,
                    businessId: credit.businessId,
                    action: 'UPDATE_CREDIT_SCHEDULE',
                    entityType: 'Credit',
                    entityId: credit.id,
                    description: `Editó el plan de pagos del crédito ${credit.id.slice(0, 8)}... (Cliente: ${credit.client?.fullName || 'N/A'}). Modificó ${schedules.length} cuotas. Total programado: $${totalScheduled.toLocaleString('es-CO')}, Saldo restante: $${newRemaining.toLocaleString('es-CO')}`,
                    oldValues: {
                        scheduleCount: credit.paymentSchedule.length,
                        totalScheduled: credit.paymentSchedule.reduce((sum, s) => sum + Number(s.scheduledAmount), 0),
                        remainingBalance: Number(credit.remainingBalance),
                        status: credit.status,
                    },
                    newValues: {
                        scheduleCount: schedules.length,
                        totalScheduled,
                        remainingBalance: newRemaining,
                        status: newStatus,
                    },
                },
            });

        });

        const refreshed = await prisma.credit.findUnique({
            where: { id: creditId },
            include: {
                client: true,
                paymentSchedule: { orderBy: { dueDate: 'asc' } },
                payments: { orderBy: { paymentDate: 'desc' } },
            },
        });

        if (!refreshed) throw new Error('No se pudo actualizar el crédito');
        return refreshed;
    }
}

export const creditService = new CreditService();
