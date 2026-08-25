import { isOverdueBogota } from './dates';
import { PaymentSchedule } from '../types';

/**
 * Información de mora agregada de un plan de pagos.
 * Regla canónica (igual a `dashboard.service.ts`): una cuota está vencida si
 * `dueDate < inicio de hoy en Bogotá && status !== 'paid' && scheduledAmount > paidAmount`.
 */
export interface OverdueInfo {
    cuotasVencidas: number; // # de cuotas atrasadas
    montoVencido: number; // suma de (scheduledAmount - paidAmount) de las cuotas atrasadas
    isOverdue: boolean; // montoVencido > 0
}

export const getOverdueInfo = (schedule?: PaymentSchedule[] | null): OverdueInfo => {
    if (!schedule || schedule.length === 0) {
        return { cuotasVencidas: 0, montoVencido: 0, isOverdue: false };
    }

    let cuotasVencidas = 0;
    let montoVencido = 0;

    for (const s of schedule) {
        const scheduledAmount = Number(s.scheduledAmount || 0);
        const paidAmount = Number(s.paidAmount || 0);
        if (s.status !== 'paid' && scheduledAmount > paidAmount && isOverdueBogota(s.dueDate)) {
            cuotasVencidas += 1;
            montoVencido += scheduledAmount - paidAmount;
        }
    }

    return { cuotasVencidas, montoVencido, isOverdue: montoVencido > 0 };
};
