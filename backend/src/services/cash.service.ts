import { Prisma, UserRole, CashMovementType } from '@prisma/client';
import prisma from '../config/database';
import { accountService } from './account.service';

interface CashMovementInput {
    businessId: string;
    type: CashMovementType;
    amount: number;
    description?: string;
    relatedCreditId?: string;
    relatedPaymentId?: string;
    paymentMethod?: string;
    accountId?: string;
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
        if (role === 'super_admin') return;

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
        // Mantener alineado con signedEffect() en account.service.ts
        return ['payment_received', 'capital_injection', 'interest_earned',
                'credit_cancellation', 'initial_capital'].includes(type);
    }

    /** Resuelve la cuenta a usar: la dada (si es válida y del negocio) o la cuenta por defecto. */
    private async resolveAccountId(businessId: string, accountId?: string): Promise<string | null> {
        if (accountId) {
            const acc = await prisma.paymentAccount.findFirst({ where: { id: accountId, businessId, active: true }, select: { id: true } });
            if (acc) return acc.id;
        }
        const def = await prisma.paymentAccount.findFirst({ where: { businessId, isDefault: true, active: true }, select: { id: true } })
            || await prisma.paymentAccount.findFirst({ where: { businessId, active: true }, select: { id: true } });
        return def?.id || null;
    }

    async recordMovement(data: CashMovementInput, userId: string, userRole: UserRole) {
        await this.validateAccess(data.businessId, userId, userRole);
        await accountService.assertDayOpen(data.businessId, new Date());

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

        const effectiveAccountId = await this.resolveAccountId(data.businessId, data.accountId);

        // Validar saldo de la cuenta específica para retiros y transferencias salientes
        if (effectiveAccountId && (data.type === 'withdrawal')) {
            const { accounts: accList } = await accountService.getBalances(data.businessId, userId, userRole);
            const accEntry = accList.find(a => a.id === effectiveAccountId);
            if (accEntry && accEntry.balance < Math.abs(data.amount)) {
                const accName = accEntry.name;
                throw new Error(
                    `Saldo insuficiente en la cuenta "${accName}". ` +
                    `Disponible: $${Math.ceil(accEntry.balance).toLocaleString('es-CO')}, ` +
                    `solicitado: $${Math.ceil(Math.abs(data.amount)).toLocaleString('es-CO')}`
                );
            }
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
                    accountId: effectiveAccountId,
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

    async injectCapital(businessId: string, amount: number, description: string | undefined, userId: string, role: UserRole, accountId?: string) {
        if (!['admin', 'super_admin'].includes(role)) throw new Error('Solo administradores pueden inyectar capital');
        return this.recordMovement({
            businessId,
            type: 'capital_injection',
            amount,
            description: description || 'Inyección de capital',
            paymentMethod: 'efectivo',
            accountId,
        }, userId, role);
    }

    async withdrawFunds(businessId: string, amount: number, description: string | undefined, userId: string, role: UserRole, accountId?: string) {
        if (!['admin', 'super_admin'].includes(role)) throw new Error('Solo administradores pueden retirar fondos');
        return this.recordMovement({
            businessId,
            type: 'withdrawal',
            amount,
            description: description || 'Retiro de fondos',
            paymentMethod: 'efectivo',
            accountId,
        }, userId, role);
    }

    async createInternalTransfer(params: {
        businessId: string;
        fromAccountId: string;
        toAccountId: string;
        amount: number;
        description?: string;
        userId: string;
        role: UserRole;
    }) {
        const { businessId, fromAccountId, toAccountId, amount, description, userId, role } = params;
        await this.validateAccess(businessId, userId, role);
        await accountService.assertDayOpen(businessId, new Date());

        if (fromAccountId === toAccountId) throw new Error('El origen y destino deben ser diferentes');
        if (amount <= 0) throw new Error('El monto debe ser mayor a 0');

        const [from, to] = await Promise.all([
            prisma.paymentAccount.findFirst({ where: { id: fromAccountId, businessId, active: true } }),
            prisma.paymentAccount.findFirst({ where: { id: toAccountId, businessId, active: true } }),
        ]);
        if (!from || !to) throw new Error('Cuenta de origen o destino no válida');

        return prisma.$transaction(async (tx) => {
            const business = await tx.business.findUnique({
                where: { id: businessId },
                select: { currentBalance: true },
            });
            if (!business) throw new Error('Negocio no encontrado');

            const desc = description || `Transferencia interna de ${from.name} a ${to.name}`;
            const movOut = await tx.cashMovement.create({
                data: {
                    businessId,
                    type: 'internal_transfer',
                    amount: new Prisma.Decimal(-amount),
                    balanceAfter: business.currentBalance,
                    description: desc,
                    paymentMethod: from.name,
                    accountId: from.id,
                    createdById: userId,
                },
            });

            const movIn = await tx.cashMovement.create({
                data: {
                    businessId,
                    type: 'internal_transfer',
                    amount: new Prisma.Decimal(amount),
                    balanceAfter: business.currentBalance,
                    description: desc,
                    paymentMethod: to.name,
                    accountId: to.id,
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
                    newValues: { fromAccount: from.name, toAccount: to.name, amount },
                },
            });

            return { movOut, movIn };
        });
    }

    async getCashFlow(filters: CashFlowFilters, userId: string, role: UserRole) {
        await this.validateAccess(filters.businessId, userId, role);

        // 1. Calcular saldos globales reales (sin filtro de fecha)
        const business = await prisma.business.findUnique({
            where: { id: filters.businessId },
            select: { currentBalance: true },
        });
        if (!business) throw new Error('Negocio no encontrado');

        const allMovements = await prisma.cashMovement.findMany({
            where: { businessId: filters.businessId },
            select: { type: true, amount: true, paymentMethod: true }
        });

        let cashBalance = 0;
        let bankBalance = 0;

        allMovements.forEach(mov => {
            const amount = Number(mov.amount);
            const isInc = this.isIncome(mov.type, amount);
            // Si es ingreso suma, si es egreso resta. Transferencias internas ya vienen con + o -
            const effectAmount = mov.type === 'internal_transfer' ? amount : (isInc ? amount : -amount);

            if (mov.paymentMethod === 'efectivo') {
                cashBalance += effectAmount;
            } else {
                bankBalance += effectAmount;
            }
        });

        // Asegurar que los subtotales cuadran con el balance declarado (herencia de datos)
        const declaredTotal = Number(business.currentBalance);
        const calculatedTotal = cashBalance + bankBalance;

        if (Math.abs(declaredTotal - calculatedTotal) > 0.01) {
            const diff = declaredTotal - calculatedTotal;
            console.warn(
                `[CashService] Discrepancia de balance detectada en negocio ${filters.businessId}: ` +
                `declarado=${declaredTotal}, calculado=${calculatedTotal}, diff=${diff}. ` +
                `Se ajusta el saldo en efectivo temporalmente.`
            );
            cashBalance += diff; // asume que cualquier discrepancia de base está en efectivo
        }

        // 2. Obtener movimientos para el periodo seleccionado
        const where: Prisma.CashMovementWhereInput = { businessId: filters.businessId };

        if (filters.startDate || filters.endDate) {
            where.createdAt = {
                ...(filters.startDate && { gte: new Date(filters.startDate) }),
                ...(filters.endDate && { lte: new Date(filters.endDate) }),
            };
        }

        const filteredMovements = await prisma.cashMovement.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            include: {
                createdBy: { select: { fullName: true, email: true } },
                relatedCredit: { select: { clientId: true } },
                relatedPayment: { select: { amount: true, id: true } },
            },
        });

        const periodSummary = filteredMovements.reduce(
            (acc, mov) => {
                const amount = Number(mov.amount);
                const isInc = this.isIncome(mov.type, amount);

                if (mov.type !== 'internal_transfer') {
                    if (isInc) acc.totalIncome += amount;
                    else acc.totalExpenses += Math.abs(amount);
                }
                acc.net = acc.totalIncome - acc.totalExpenses;
                return acc;
            },
            { totalIncome: 0, totalExpenses: 0, net: 0 }
        );

        // Saldos por cuenta (nuevo sistema multi-cuenta). Se mantiene cash/bank por compatibilidad.
        const { accounts } = await accountService.getBalances(filters.businessId, userId, role);

        return {
            movements: filteredMovements,
            summary: periodSummary,
            balances: {
                total: declaredTotal,
                cash: cashBalance,
                bank: bankBalance,
                accounts,
            }
        };
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
