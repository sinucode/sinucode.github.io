import api from '../lib/axios';

export interface CashMovementInput {
    businessId: string;
    type: string;
    amount: number;
    description?: string;
    relatedCreditId?: string;
    relatedPaymentId?: string;
}


export const injectCapital = async (payload: { businessId: string; amount: number; description?: string }) => {
    const res = await api.post('/cash/inject', payload);
    return res.data;
};

export const withdrawFunds = async (payload: { businessId: string; amount: number; description?: string }) => {
    const res = await api.post('/cash/withdraw', payload);
    return res.data;
};

export const getCashFlow = async (params: { businessId: string; startDate?: string; endDate?: string }) => {
    const res = await api.get('/cash/flow', { params });
    return res.data as {
        movements: any[];
        summary: {
            totalIncome: number;
            totalExpenses: number;
            net: number;
        };
        balances: {
            total: number;
            cash: number;
            bank: number;
        };
    };
};

export const transferFunds = async (payload: { businessId: string; amount: number; fromMethod: string; toMethod: string; description?: string }) => {
    const res = await api.post('/cash/transfer', payload);
    return res.data;
};


export const forecastCash = async (params: { businessId: string; targetDate: string }) => {
    const res = await api.get('/cash/forecast', { params });
    return res.data as { currentBalance: number; expectedIncome: number; projectedBalance: number; targetDate: string };
};
