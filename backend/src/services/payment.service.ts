import prisma from '../config/database';
import { Prisma, UserRole } from '@prisma/client';

interface PaymentFilters {
    businessId?: string;
    startDate?: string;
    endDate?: string;
    paymentMethod?: string;
}

export class PaymentService {
    private async getUserBusiness(userId: string): Promise<string | null> {
        const ub = await prisma.userBusiness.findFirst({
            where: { userId },
            select: { businessId: true },
        });
        return ub?.businessId || null;
    }

    async listPayments(userId: string, role: UserRole, filters: PaymentFilters) {
        let targetBusinessId = filters.businessId;

        if (role === 'user') {
            const userBusinessId = await this.getUserBusiness(userId);
            if (!userBusinessId) throw new Error('Usuario no tiene negocio asignado');
            if (targetBusinessId && targetBusinessId !== userBusinessId) {
                throw new Error('No tiene permisos para ver pagos de otro negocio');
            }
            targetBusinessId = userBusinessId;
        }

        const where: Prisma.PaymentWhereInput = {
            ...(targetBusinessId && { credit: { businessId: targetBusinessId } }),
            ...(filters.startDate || filters.endDate
                ? {
                    paymentDate: {
                        ...(filters.startDate && { gte: new Date(filters.startDate) }),
                        ...(filters.endDate && { lte: new Date(filters.endDate) }),
                    },
                }
                : {}),
            ...(filters.paymentMethod && { paymentMethod: filters.paymentMethod }),
        };

        const payments = await prisma.payment.findMany({
            where,
            orderBy: { paymentDate: 'desc' },
            include: {
                credit: {
                    select: {
                        id: true,
                        businessId: true,
                        client: { select: { fullName: true, phone: true } },
                    },
                },
            },
        });

        return payments;
    }
}

export const paymentService = new PaymentService();
