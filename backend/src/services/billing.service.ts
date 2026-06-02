import prisma from '../config/database';

export interface BillingSummaryItem {
    businessId: string;
    businessName: string;
    creditsCount: number;
    pricePerUnit: number;
    total: number;
}

export class BillingService {
    /**
     * Cuenta créditos creados en un período para todos los negocios activos.
     * Devuelve también el precio configurado por negocio.
     */
    async getCreditsSummary(startDate: string, endDate: string): Promise<BillingSummaryItem[]> {
        const start = new Date(startDate + 'T00:00:00.000Z');
        const end   = new Date(endDate   + 'T23:59:59.999Z');

        const businesses = await prisma.business.findMany({
            select: {
                id: true,
                name: true,
                billingPricePerCredit: true,
                _count: {
                    select: {
                        credits: {
                            where: { createdAt: { gte: start, lte: end } },
                        },
                    },
                },
            },
            orderBy: { name: 'asc' },
        });

        return businesses.map(b => {
            const price = Number(b.billingPricePerCredit);
            const count = b._count.credits;
            return {
                businessId:   b.id,
                businessName: b.name,
                creditsCount: count,
                pricePerUnit: price,
                total:        count * price,
            };
        });
    }

    /** Actualiza el precio por crédito configurado para un negocio. */
    async updateBusinessPrice(businessId: string, pricePerUnit: number): Promise<void> {
        await prisma.business.update({
            where: { id: businessId },
            data:  { billingPricePerCredit: pricePerUnit },
        });
    }

    /** Guarda un cobro mensual como registro histórico. */
    async createBilling(payload: {
        businessId:   string;
        businessName: string;
        periodStart:  string;
        periodEnd:    string;
        creditsCount: number;
        pricePerUnit: number;
        totalAmount:  number;
        notes?:       string;
    }, userId: string) {
        return prisma.businessBilling.create({
            data: {
                businessId:   payload.businessId,
                businessName: payload.businessName,
                periodStart:  new Date(payload.periodStart + 'T00:00:00.000Z'),
                periodEnd:    new Date(payload.periodEnd   + 'T23:59:59.999Z'),
                creditsCount: payload.creditsCount,
                pricePerUnit: payload.pricePerUnit,
                totalAmount:  payload.totalAmount,
                notes:        payload.notes,
                createdById:  userId,
            },
        });
    }

    /** Lista cobros guardados con filtros opcionales. */
    async listBillings(filters: {
        businessId?: string;
        startDate?:  string;
        endDate?:    string;
    } = {}) {
        const where: any = {};
        if (filters.businessId) where.businessId = filters.businessId;
        if (filters.startDate || filters.endDate) {
            where.createdAt = {};
            if (filters.startDate) where.createdAt.gte = new Date(filters.startDate + 'T00:00:00.000Z');
            if (filters.endDate)   where.createdAt.lte = new Date(filters.endDate   + 'T23:59:59.999Z');
        }
        return prisma.businessBilling.findMany({
            where,
            orderBy: { createdAt: 'desc' },
        });
    }
}

export const billingService = new BillingService();
