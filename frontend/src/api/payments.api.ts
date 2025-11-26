import api from '../lib/axios';
import { Payment } from '../types';

export interface RegisterPaymentPayload {
    creditId: string;
    amount: number;
    paymentDate?: string;
    paymentMethod?: string;
    notes?: string;
    scheduleId?: string;
}

export const registerPayment = async (payload: RegisterPaymentPayload): Promise<Payment> => {
    const res = await api.post('/payments', payload);
    return res.data;
};

export const getPayments = async (params?: { businessId?: string; startDate?: string; endDate?: string; paymentMethod?: string }): Promise<Payment[]> => {
    const res = await api.get('/payments', { params });
    return res.data;
};
