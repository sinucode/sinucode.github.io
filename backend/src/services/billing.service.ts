import prisma from '../config/database';

export interface BillingSummaryItem {
    businessId:   string;
    businessName: string;
    creditsCount: number;   // solo cobrables (no cancelados, no cobrados)
    pricePerUnit: number;
    total:        number;
}

export interface CreditBillingItem {
    id:         string;
    clientName: string;
    createdAt:  string;
    amount:     number;
    status:     string;   // 'active' | 'paid' | 'overdue' | 'cancelled'
}

export class BillingService {
    /**
     * Cuenta créditos COBRABLES (no cancelados, no cobrados aún) por negocio.
     */
    async getCreditsSummary(startDate: string, endDate: string): Promise<BillingSummaryItem[]> {
        const start = new Date(startDate + 'T00:00:00.000Z');
        const end   = new Date(endDate   + 'T23:59:59.999Z');

        const businesses = await prisma.business.findMany({
            select: {
                id:   true,
                name: true,
                billingPricePerCredit: true,
                _count: {
                    select: {
                        credits: {
                            where: {
                                createdAt: { gte: start, lte: end },
                                billingId: null,
                                status:    { not: 'cancelled' },
                            },
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

    /**
     * Devuelve el detalle de créditos SIN cobrar en el período para un negocio.
     * Incluye cancelados (para el PDF, pero sin cargo).
     */
    async getUnbilledCredits(
        businessId: string,
        startDate:  string,
        endDate:    string,
    ): Promise<CreditBillingItem[]> {
        const start = new Date(startDate + 'T00:00:00.000Z');
        const end   = new Date(endDate   + 'T23:59:59.999Z');

        const credits = await prisma.credit.findMany({
            where: {
                businessId,
                createdAt: { gte: start, lte: end },
                billingId: null,
            },
            include: { client: { select: { fullName: true } } },
            orderBy: { createdAt: 'asc' },
        });

        return credits.map(c => ({
            id:         c.id,
            clientName: c.client.fullName,
            createdAt:  c.createdAt.toISOString(),
            amount:     Number(c.amount),
            status:     c.status,
        }));
    }

    /** Actualiza el precio por crédito configurado para un negocio. */
    async updateBusinessPrice(businessId: string, pricePerUnit: number): Promise<void> {
        await prisma.business.update({
            where: { id: businessId },
            data:  { billingPricePerCredit: pricePerUnit },
        });
    }

    /**
     * Guarda un cobro mensual:
     * - Busca todos los créditos sin cobrar del período para ese negocio
     * - Calcula count (no cancelados) y total
     * - Crea el registro BusinessBilling
     * - Marca TODOS los créditos del período (incluyendo cancelados) como cobrados
     * - Devuelve el billing con el detalle de créditos
     */
    async createBilling(payload: {
        businessId:   string;
        businessName: string;
        periodStart:  string;
        periodEnd:    string;
        pricePerUnit: number;
        notes?:       string;
        // creditsCount y totalAmount los calcula el backend
        creditsCount?: number;
        totalAmount?:  number;
    }, userId: string) {
        const start = new Date(payload.periodStart + 'T00:00:00.000Z');
        const end   = new Date(payload.periodEnd   + 'T23:59:59.999Z');

        return prisma.$transaction(async (tx) => {
            // Todos los créditos sin cobrar del período (incluyendo cancelados)
            const credits = await tx.credit.findMany({
                where: {
                    businessId: payload.businessId,
                    createdAt:  { gte: start, lte: end },
                    billingId:  null,
                },
                include: { client: { select: { fullName: true } } },
                orderBy: { createdAt: 'asc' },
            });

            // Solo los cobrables cuentan para el monto
            const billable    = credits.filter(c => c.status !== 'cancelled');
            const creditsCount = billable.length;
            const totalAmount  = creditsCount * payload.pricePerUnit;

            // Crear el registro
            const billing = await tx.businessBilling.create({
                data: {
                    businessId:   payload.businessId,
                    businessName: payload.businessName,
                    periodStart:  start,
                    periodEnd:    end,
                    creditsCount,
                    pricePerUnit: payload.pricePerUnit,
                    totalAmount,
                    notes:        payload.notes,
                    createdById:  userId,
                },
            });

            // Marcar TODOS los créditos (incluyendo cancelados) como cobrados
            if (credits.length > 0) {
                await tx.credit.updateMany({
                    where: { id: { in: credits.map(c => c.id) } },
                    data:  { billingId: billing.id },
                });
            }

            const creditDetails: CreditBillingItem[] = credits.map(c => ({
                id:         c.id,
                clientName: c.client.fullName,
                createdAt:  c.createdAt.toISOString(),
                amount:     Number(c.amount),
                status:     c.status,
            }));

            return { ...billing, credits: creditDetails };
        });
    }

    /** Revierte un cobro: borra el registro; los créditos quedan libres (billingId → null). */
    async deleteBilling(id: string): Promise<void> {
        await prisma.businessBilling.delete({ where: { id } });
    }

    /** Lista cobros guardados con crédito detallado incluido. */
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

        const billings = await prisma.businessBilling.findMany({
            where,
            include: {
                credits: {
                    include: { client: { select: { fullName: true } } },
                    orderBy: { createdAt: 'asc' },
                },
            },
            orderBy: { createdAt: 'desc' },
        });

        return billings.map(b => ({
            ...b,
            credits: b.credits.map(c => ({
                id:         c.id,
                clientName: c.client.fullName,
                createdAt:  c.createdAt.toISOString(),
                amount:     Number(c.amount),
                status:     c.status,
            })),
        }));
    }
}

export const billingService = new BillingService();
