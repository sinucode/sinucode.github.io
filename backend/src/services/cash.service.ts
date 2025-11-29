import { Prisma, UserRole, CashMovementType } from '@prisma/client';
import prisma from '../config/database';

interface CashMovementInput {
    businessId: string;
    type: CashMovementType;
    amount: number;
    description?: string;
    relatedCreditId?: string;
    relatedPaymentId?: string;
}

interface CashFlowFilters {
    businessId: string;
    startDate?: string;
    endDate?: string;
}

export class CashService {
    /**
     * Valida que el usuario tenga acceso al negocio solicitado
     * Implementa Defense-in-Depth: validación a nivel de servicio
     * OWASP: A01:2021 – Broken Access Control
     * 
     * @param businessId - ID del negocio a validar
     * @param userId - ID del usuario que solicita acceso
     * @param role - Rol del usuario (super_admin, admin, user)
     * @throws Error si el usuario no tiene permisos
     */
    private async validateAccess(businessId: string, userId: string, role: UserRole): Promise<void> {
        // Super admin tiene acceso irrestricto a todos los negocios
        if (role === 'super_admin') {
            return;
        }

        // Admin tiene acceso a todos los negocios (política definida)
        // Si se desea restringir admins a negocios específicos, modificar aquí
        if (role === 'admin') {
            return;
        }

        // Usuario regular: DEBE estar asignado al negocio
        const userBusiness = await prisma.userBusiness.findFirst({
            where: {
                userId,
                businessId,
            },
            select: {
                businessId: true,
            },
        });

        // Si no hay relación usuario-negocio, denegar acceso
        if (!userBusiness) {
            // Log de intento de acceso no autorizado (para auditoría de seguridad)
            await prisma.auditLog.create({
                data: {
                    userId,
                    action: 'UNAUTHORIZED_ACCESS_ATTEMPT',
                    description: `Intento de acceso no autorizado al negocio ${businessId}`,
                    entityType: 'Business',
                    entityId: businessId,
                },
            }).catch(() => {
                // Silenciar errores de auditoría para no revelar información
            });

            throw new Error('No tiene permisos para acceder a los datos de este negocio');
        }
    }

    private isIncome(type: CashMovementType) {
        return ['payment_received', 'capital_injection', 'interest_earned'].includes(type);
    }

    async recordMovement(data: CashMovementInput, userId: string, userRole: UserRole) {
        await this.validateAccess(data.businessId, userId, userRole);

        const business = await prisma.business.findUnique({
            where: { id: data.businessId },
            select: { currentBalance: true },
        });
        if (!business) throw new Error('Negocio no encontrado');

        const isIncome = this.isIncome(data.type);
        const newBalance = isIncome
            ? new Prisma.Decimal(business.currentBalance).plus(data.amount)
            : new Prisma.Decimal(business.currentBalance).minus(data.amount);

        if (newBalance.lt(0)) {
            throw new Error(
                `Fondos insuficientes. Saldo actual: ${business.currentBalance}, operación: ${data.amount}`
            );
        }

        const movement = await prisma.$transaction(async (tx) => {
            const mov = await tx.cashMovement.create({
                data: {
                    businessId: data.businessId,
                    type: data.type,
                    amount: new Prisma.Decimal(data.amount),
                    balanceAfter: newBalance,
                    description: data.description,
                    relatedCreditId: data.relatedCreditId,
                    relatedPaymentId: data.relatedPaymentId,
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
                    newValues: {
                        type: data.type,
                        amount: data.amount,
                        balanceAfter: newBalance,
                    },
                },
            });

            return mov;
        });

        return movement;
    }

    async injectCapital(businessId: string, amount: number, description: string | undefined, userId: string, role: UserRole) {
        if (!['admin', 'super_admin'].includes(role)) {
            throw new Error('Solo administradores pueden inyectar capital');
        }
        return this.recordMovement(
            {
                businessId,
                type: 'capital_injection',
                amount,
                description: description || 'Inyección de capital',
            },
            userId,
            role
        );
    }

    async withdrawFunds(businessId: string, amount: number, description: string | undefined, userId: string, role: UserRole) {
        if (!['admin', 'super_admin'].includes(role)) {
            throw new Error('Solo administradores pueden retirar fondos');
        }
        return this.recordMovement(
            {
                businessId,
                type: 'withdrawal',
                amount,
                description: description || 'Retiro de fondos',
            },
            userId,
            role
        );
    }

    async getCashFlow(filters: CashFlowFilters, userId: string, role: UserRole) {
        await this.validateAccess(filters.businessId, userId, role);
        const where: Prisma.CashMovementWhereInput = {
            businessId: filters.businessId,
        };
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
                const income = this.isIncome(mov.type);
                if (income) acc.totalIncome += Number(mov.amount);
                else acc.totalExpenses += Number(mov.amount);
                acc.net = acc.totalIncome - acc.totalExpenses;
                return acc;
            },
            { totalIncome: 0, totalExpenses: 0, net: 0 }
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
