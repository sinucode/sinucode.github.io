import api from '../lib/axios';

export interface BillingSummaryItem {
    businessId:   string;
    businessName: string;
    creditsCount: number;
    pricePerUnit: number;
    total:        number;
}

export interface CreditBillingItem {
    id:         string;
    clientName: string;
    createdAt:  string;
    amount:     number;
    status:     'active' | 'paid' | 'overdue' | 'cancelled';
}

export interface BusinessBilling {
    id:           string;
    businessId:   string;
    businessName: string;
    periodStart:  string;
    periodEnd:    string;
    creditsCount: number;
    pricePerUnit: string | number;
    totalAmount:  string | number;
    notes?:       string | null;
    createdAt:    string;
    credits?:     CreditBillingItem[];
}

export const getBillingSummary = async (startDate: string, endDate: string): Promise<BillingSummaryItem[]> => {
    const res = await api.get('/billing/summary', { params: { startDate, endDate } });
    return res.data;
};

export const getUnbilledCredits = async (
    businessId: string,
    startDate:  string,
    endDate:    string,
): Promise<CreditBillingItem[]> => {
    const res = await api.get('/billing/credits', { params: { businessId, startDate, endDate } });
    return res.data;
};

export const updateBusinessPrice = async (businessId: string, pricePerUnit: number): Promise<void> => {
    await api.patch(`/billing/price/${businessId}`, { pricePerUnit });
};

export const createBilling = async (payload: {
    businessId:   string;
    businessName: string;
    periodStart:  string;
    periodEnd:    string;
    pricePerUnit: number;
    notes?:       string;
}): Promise<BusinessBilling> => {
    const res = await api.post('/billing', payload);
    return res.data;
};

export const listBillings = async (filters?: {
    businessId?: string;
    startDate?:  string;
    endDate?:    string;
}): Promise<BusinessBilling[]> => {
    const res = await api.get('/billing', { params: filters });
    return res.data;
};
