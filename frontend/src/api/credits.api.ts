import api from '../lib/axios';
import { Credit, PaymentSchedule, Payment, PaymentFrequency } from '../types';

export interface SimulateCreditPayload {
    amount: number;
    interestRate: number;
    termDays: number;
    frequency: PaymentFrequency;
    startDate?: string;
}

export interface CreateCreditPayload extends SimulateCreditPayload {
    clientId: string;
    businessId?: string;
}

export interface CreditSimulation {
    totalInterest: number;
    totalWithInterest: number;
    numberOfPayments: number;
    paymentAmount: number;
    paymentPlan: {
        installmentNumber: number;
        dueDate: string;
        scheduledAmount: number;
    }[];
    endDate: string;
}

export interface CreditDetail extends Credit {
    paymentSchedule: PaymentSchedule[];
    payments: Payment[];
}

export interface UpdateSchedulePayload {
    schedules: { id: string; dueDate: string; scheduledAmount: number }[];
}

export const simulateCredit = async (payload: SimulateCreditPayload): Promise<CreditSimulation> => {
    const res = await api.post('/credits/simulate', payload);
    return res.data;
};

export const createCredit = async (payload: CreateCreditPayload): Promise<CreditDetail> => {
    const res = await api.post('/credits', payload);
    return res.data;
};

export const getCredits = async (params?: { businessId?: string; status?: string; dueToday?: boolean; overdue?: boolean }): Promise<Credit[]> => {
    const res = await api.get('/credits', { params });
    return res.data;
};

export const getCreditDetail = async (id: string): Promise<CreditDetail> => {
    const res = await api.get(`/credits/${id}`);
    return res.data;
};

export const updateCreditSchedule = async (
    creditId: string,
    payload: UpdateSchedulePayload
): Promise<CreditDetail> => {
    const res = await api.put(`/credits/${creditId}/schedule`, payload);
    return res.data;
};
