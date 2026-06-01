import api from '../lib/axios';

export interface PaymentAccount {
    id: string;
    businessId: string;
    name: string;
    type: 'cash' | 'bank' | 'wallet' | string;
    isDefault: boolean;
    isDisbursementDefault: boolean;
    active: boolean;
}

export interface AccountBalance {
    id: string;
    name: string;
    type: string;
    isDefault: boolean;
    isDisbursementDefault: boolean;
    balance: number;
}

export const listAccounts = async (businessId: string): Promise<PaymentAccount[]> => {
    const res = await api.get('/accounts', { params: { businessId } });
    return res.data;
};

export const getAccountBalances = async (businessId: string): Promise<{ accounts: AccountBalance[]; total: number }> => {
    const res = await api.get('/accounts/balances', { params: { businessId } });
    return res.data;
};

export const createAccount = async (payload: { businessId: string; name: string; type?: string }): Promise<PaymentAccount> => {
    const res = await api.post('/accounts', payload);
    return res.data;
};

export const updateAccount = async (id: string, payload: { name?: string; type?: string }): Promise<PaymentAccount> => {
    const res = await api.put(`/accounts/${id}`, payload);
    return res.data;
};

export const deleteAccount = async (id: string, payload?: { mode?: 'transfer' | 'withdraw'; targetAccountId?: string }) => {
    const res = await api.delete(`/accounts/${id}`, { data: payload || {} });
    return res.data;
};

export const setDefaultAccount = async (id: string, kind: 'payment' | 'disbursement'): Promise<void> => {
    await api.patch(`/accounts/${id}/default`, { kind });
};

// ─── Cierre diario ───
export interface CashClose {
    id: string;
    businessId: string;
    closeDate: string;
    status: 'closed' | 'reopened';
    closeMode: 'manual' | 'auto';
    totalBalance: number | string;
    accountBalances: { accountId: string; name: string; systemBalance: number; countedBalance: number | null; difference: number | null }[];
    notes?: string | null;
    closedById: string;
    closedAt: string;
    reopenedById?: string | null;
    reopenedAt?: string | null;
    reopenReason?: string | null;
}

export const getTodayClose = async (businessId: string): Promise<CashClose | null> => {
    const res = await api.get('/accounts/closes/today', { params: { businessId } });
    return res.data;
};

export const listCloses = async (businessId: string): Promise<CashClose[]> => {
    const res = await api.get('/accounts/closes', { params: { businessId } });
    return res.data;
};

export const createClose = async (payload: { businessId: string; countedBalances?: Record<string, number>; notes?: string }): Promise<CashClose> => {
    const res = await api.post('/accounts/closes', payload);
    return res.data;
};

export const reopenClose = async (id: string, reason: string): Promise<CashClose> => {
    const res = await api.post(`/accounts/closes/${id}/reopen`, { reason });
    return res.data;
};

// ─── Reporte de cierre interactivo ───
export interface CloseReportAccount {
    accountId: string;
    name: string;
    type: string;
    apertura: number;
    ingresos: number;
    egresos: number;
    esperado: number;
    contado: number | null;
    diferencia: number | null;
}

export interface CloseReportPayment {
    id: string;
    hora: string;
    clienteNombre: string;
    creditId: string;
    cuotaNumero: number | null;
    monto: number;
    cuenta: string;
    cobrador: string;
}

export interface CloseReportOperation {
    id: string;
    hora: string;
    tipo: string;
    cuenta: string;
    monto: number;
    efectoSignado: number;
    descripcion: string;
    usuario: string;
}

export interface CloseReportCollector {
    cobradorId: string;
    cobradorNombre: string;
    totalCobrado: number;
    numPagos: number;
    /** Monto por cuenta de pago: [{ cuenta: 'Efectivo', monto: 30000 }, ...] */
    porCuenta: { cuenta: string; monto: number }[];
}

export interface CloseReportDisburser {
    usuarioId: string;
    usuarioNombre: string;
    numCreditos: number;
    totalDesembolsado: number;
}

export interface CloseReport {
    meta: {
        businessId: string;
        businessName: string;
        date: string;
        close: {
            id: string;
            status: 'closed' | 'reopened';
            closeMode: 'manual' | 'auto';
            closedAt: string;
            totalBalance: number;
            notes?: string | null;
        } | null;
    };
    accounts: CloseReportAccount[];
    payments: CloseReportPayment[];
    collectors: CloseReportCollector[];
    disbursers: CloseReportDisburser[];
    operations: CloseReportOperation[];
    totals: {
        totalCobrado: number;
        numPagos: number;
        totalIngresos: number;
        totalEgresos: number;
        neto: number;
    };
}

export const getCloseReport = async (businessId: string, date: string): Promise<CloseReport> => {
    const res = await api.get('/accounts/closes/report', { params: { businessId, date } });
    return res.data;
};
