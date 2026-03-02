import { Prisma, UserRole, CashMovementType } from '@prisma/client';
import prisma from '../config/database';

interface CashMovementInput {
    businessId: string;
    type: CashMovementType;
    amount: number;
    description?: string;
    relatedCreditId?: string;
    relatedPaymentId?: string;
    paymentMethod?: string;
}

interface CashFlowFilters {
    businessId: string;
    startDate?: string;
    endDate?: string;
}

export class CashService {
    /**
     * Valida que el usuario tenga acceso al negocio solicitado
     */
    private async validateAccess(businessId: string, userId: string, role: UserRole): Promise<void> {
        if (role === 'super_admin' || role === 'admin') return;

        const userBusiness = await prisma.userBusiness.findFirst({
            where: { userId, businessId },
            select: { businessId: true },
        });

        if (!userBusiness) {
            await prisma.auditLog.create({
                data: {
                    userId,
                    action: 'UNAUTHORIZED_ACCESS_ATTEMPT',
                    description: `Intento de acceso no autorizado al negocio ${businessId}`,
                    entityType: 'Business',
                    entityId: businessId,
                },
            }).catch(() => { });
            throw new Error('No tiene permisos para acceder a los datos de este negocio');
        }
    }

    private isIncome(type: CashMovementType, amount: number) {
        if (type === 'internal_transfer') return amount > 0;
        return ['payment_received', 'capital_injection', 'interest_earned'].includes(type);
    }

    async recordMovement(data: CashMovementInput, userId: string, userRole: UserRole) {
        await this.validateAccess(data.businessId, userId, userRole);

        const business = await prisma.business.findUnique({
            where: { id: data.businessId },
            select: { currentBalance: true },
        });
        if (!business) throw new Error('Negocio no encontrado');

        const isIncome = this.isIncome(data.type, data.amount);
        const affectAmount = new Prisma.Decimal(Math.abs(data.amount));
        const newBalance = isIncome
            ? new Prisma.Decimal(business.currentBalance).plus(affectAmount)
            : new Prisma.Decimal(business.currentBalance).minus(affectAmount);

        if (newBalance.lt(0)) {
            throw new Error(`Fondos insuficientes. Saldo actual: ${business.currentBalance}, operación: ${data.amount}`);
        }

        return prisma.$transaction(async (tx) => {
            const mov = await tx.cashMovement.create({
                data: {
                    businessId: data.businessId,
                    type: data.type,
                    amount: new Prisma.Decimal(data.amount),
                    balanceAfter: newBalance,
                    description: data.description,
                    relatedCreditId: data.relatedCreditId,
                    relatedPaymentId: data.relatedPaymentId,
                    paymentMethod: data.paymentMethod || 'efectivo',
                    createdById: userId,
                },
            });

            await tx.business.update({
                where: { id: data.businessId },
                data: { currentBalance: newBalance },
            });

            await tx.auditLog.create({
                data: {
                    userId,
                    businessId: data.businessId,
                    action: 'cash_movement_recorded',
                    entityType: 'cash_movement',
                    entityId: mov.id,
                    newValues: { type: data.type, amount: data.amount, balanceAfter: newBalance },
                },
            });

            return mov;
        });
    }

    async injectCapital(businessId: string, amount: number, description: string | undefined, userId: string, role: UserRole) {
        if (!['admin', 'super_admin'].includes(role)) throw new Error('Solo administradores pueden inyectar capital');
        return this.recordMovement({
            businessId,
            type: 'capital_injection',
            amount,
            description: description || 'Inyección de capital',
            paymentMethod: 'efectivo'
        }, userId, role);
    }

    async withdrawFunds(businessId: string, amount: number, description: string | undefined, userId: string, role: UserRole) {
        if (!['admin', 'super_admin'].includes(role)) throw new Error('Solo administradores pueden retirar fondos');
        return this.recordMovement({
            businessId,
            type: 'withdrawal',
            amount,
            description: description || 'Retiro de fondos',
            paymentMethod: 'efectivo'
        }, userId, role);
    }

    async createInternalTransfer(params: {
        businessId: string;
        fromMethod: string;
        toMethod: string;
        amount: number;
        description?: string;
        userId: string;
        role: UserRole;
    }) {
        const { businessId, fromMethod, toMethod, amount, description, userId, role } = params;
        await this.validateAccess(businessId, userId, role);

        if (fromMethod === toMethod) throw new Error('El origen y destino deben ser diferentes');
        if (amount <= 0) throw new Error('El monto debe ser mayor a 0');

        return prisma.$transaction(async (tx) => {
            const business = await tx.business.findUnique({
                where: { id: businessId },
                select: { currentBalance: true },
            });
            if (!business) throw new Error('Negocio no encontrado');

            const movOut = await tx.cashMovement.create({
                data: {
                    businessId,
                    type: 'internal_transfer',
                    amount: new Prisma.Decimal(-amount),
                    balanceAfter: business.currentBalance,
                    description: description || `Transferencia interna de ${fromMethod} a ${toMethod}`,
                    paymentMethod: fromMethod,
                    createdById: userId,
                },
            });

            const movIn = await tx.cashMovement.create({
                data: {
                    businessId,
                    type: 'internal_transfer',
                    amount: new Prisma.Decimal(amount),
                    balanceAfter: business.currentBalance,
                    description: description || `Transferencia interna de ${fromMethod} a ${toMethod}`,
                    paymentMethod: toMethod,
                    createdById: userId,
                },
            });

            await tx.auditLog.create({
                data: {
                    userId,
                    businessId,
                    action: 'internal_transfer_recorded',
                    entityType: 'cash_movement',
                    entityId: `${movOut.id},${movIn.id}`,
                    newValues: { fromMethod, toMethod, amount },
                },
            });

            return { movOut, movIn };
        });
    }

    async getCashFlow(filters: CashFlowFilters, userId: string, role: UserRole) {
        await this.validateAccess(filters.businessId, userId, role);
        const where: Prisma.CashMovementWhereInput = { businessId: filters.businessId };

        if (filters.startDate || filters.endDate) {
            where.createdAt = {
                ...(filters.startDate && { gte: new Date(filters.startDate) }),
                ...(filters.endDate && { lte: new Date(filters.endDate) }),
            };
        }

        const movements = await prisma.cashMovement.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            include: {
                createdBy: { select: { fullName: true, email: true } },
                relatedCredit: { select: { clientId: true } },
                relatedPayment: { select: { amount: true, id: true } },
            },
        });

        const summary = movements.reduce(
            (acc, mov) => {
                const amount = Number(mov.amount);
                const isInc = this.isIncome(mov.type, amount);

                if (mov.type !== 'internal_transfer') {
                    if (isInc) acc.totalIncome += amount;
                    else acc.totalExpenses += Math.abs(amount);
                }

                if (mov.paymentMethod === 'efectivo') acc.cashBalance += amount;
                else acc.bankBalance += amount;

                acc.net = acc.cashBalance + acc.bankBalance;
                return acc;
            },
            { totalIncome: 0, totalExpenses: 0, net: 0, cashBalance: 0, bankBalance: 0 }
        );

        return { movements, summary };
    }

    async reconcile(businessId: string, userId: string, role: UserRole) {
        await this.validateAccess(businessId, userId, role);
        const business = await prisma.business.findUnique({
            where: { id: businessId },
            select: { currentBalance: true, initialCapital: true },
        });
        if (!business) throw new Error('Negocio no encontrado');

        const lastMovement = await prisma.cashMovement.findFirst({
            where: { businessId },
            orderBy: { createdAt: 'desc' },
            select: { balanceAfter: true },
        });

        const expected = lastMovement?.balanceAfter ?? business.initialCapital;
        const isReconciled = new Prisma.Decimal(expected).equals(business.currentBalance);

        return {
            isReconciled,
            currentBalance: business.currentBalance,
            lastRecordedBalance: expected,
            discrepancy: new Prisma.Decimal(business.currentBalance).minus(expected),
        };
    }

    async forecast(businessId: string, targetDate: Date, userId: string, role: UserRole) {
        await this.validateAccess(businessId, userId, role);

        const business = await prisma.business.findUnique({
            where: { id: businessId },
            select: { currentBalance: true },
        });
        if (!business) throw new Error('Negocio no encontrado');

        const pending = await prisma.paymentSchedule.findMany({
            where: {
                credit: { businessId },
                status: { in: ['pending', 'partial'] },
                dueDate: { lte: targetDate },
            },
            select: { scheduledAmount: true, paidAmount: true },
        });

        const expectedIncome = pending.reduce((acc, p) => {
            return acc + (Number(p.scheduledAmount) - Number(p.paidAmount));
        }, 0);

        const projectedBalance = new Prisma.Decimal(business.currentBalance).plus(expectedIncome);

        return {
            businessId,
            targetDate,
            currentBalance: business.currentBalance,
            expectedIncome,
            projectedBalance,
        };
    }
}

export const cashService = new CashService();
