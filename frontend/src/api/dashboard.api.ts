import api from '../lib/axios';

export interface DashboardKpis {
    totalAdeudado: number;
    carteraAlDia: number;
    carteraVencida: number;
    pagosRecibidos: number;
    donacionesRecibidas: number;
    gananciaRealizada: number;
    creditosNuevos: number;
    creditosActivos: number;
    creditosVencidos: number;
    cobrosHoy: number;
    totalRetiros: number;
    totalDiezmos: number;
}

export interface TopDeudor {
    clientId: string;
    creditId: string;
    fullName: string;
    saldo: number;
    cuotasVencidas: number;
    ultimaFechaPago: string | null;
}

export interface TendenciaPunto {
    fecha: string;
    monto: number;
}

export interface ProximoVencimiento {
    fecha: string;
    cantidad: number;
    monto: number;
}

export interface DashboardStats {
    kpis: DashboardKpis;
    topDeudores: TopDeudor[];
    tendenciaPagos: TendenciaPunto[];
    proximosVencimientos: ProximoVencimiento[];
    distribucionCartera: {
        activos: number;
        vencidos: number;
        pagados: number;
    };
}

export const getDashboardStats = async (params: {
    businessId: string;
    startDate: string;
    endDate: string;
}): Promise<DashboardStats> => {
    const res = await api.get('/dashboard/stats', { params });
    return res.data;
};
