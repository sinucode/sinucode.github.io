import api from '../lib/axios';

export interface TitheCreditItem {
    creditId: string;
    clientName: string;
    capital: number;
    totalPaid: number;
    rentabilidad: number;
    tithe: number;
    tithePaid: boolean;
    tithePaidAt: string | null;
    completionDate: string | null;
}

export interface TitheSummary {
    business: { id: string; name: string; currentBalance: number };
    titheRate: number;
    items: TitheCreditItem[];
    totals: {
        rentabilidadTotal: number;
        diezmoPendiente: number;
        diezmoPagado: number;
        countPendiente: number;
        countPagado: number;
    };
}

export interface PayTitheResult {
    success: boolean;
    tithePaymentId: string;
    titheAmount: number;
    totalProfit: number;
    creditsPaid: number;
    newBalance: number;
}

export const getTitheSummary = async (businessId: string): Promise<TitheSummary> => {
    const res = await api.get('/tithe/summary', { params: { businessId } });
    return res.data;
};

export const payTithe = async (businessId: string, creditIds: string[], accountId?: string): Promise<PayTitheResult> => {
    const res = await api.post('/tithe/pay', { businessId, creditIds, accountId: accountId || undefined });
    return res.data;
};
