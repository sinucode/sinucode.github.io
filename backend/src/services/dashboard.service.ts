import { UserRole } from '@prisma/client';
import prisma from '../config/database';

interface DashboardStatsParams {
    businessId: string;
    startDate: string;
    endDate: string;
    userId: string;
    role: UserRole;
}

export interface DashboardStats {
    kpis: {
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
    };
    topDeudores: Array<{
        clientId: string;
        creditId: string;
        fullName: string;
        saldo: number;
        cuotasVencidas: number;
        ultimaFechaPago: string | null;
    }>;
    tendenciaPagos: Array<{ fecha: string; monto: number }>;
    proximosVencimientos: Array<{ fecha: string; cantidad: number; monto: number }>;
    distribucionCartera: {
        activos: number;
        vencidos: number;
        pagados: number;
    };
}

export class DashboardService {
    /**
     * Validar acceso del usuario al negocio.
     * Super_admin y admin pueden acceder a cualquier negocio.
     * Users solo a los que tienen asignados.
     */
    private async validateAccess(businessId: string, userId: string, role: UserRole): Promise<void> {
        if (role === 'super_admin') return;

        const userBusiness = await prisma.userBusiness.findFirst({
            where: { userId, businessId },
            select: { businessId: true },
        });

        if (!userBusiness) {
            throw new Error('No tiene permisos para acceder a este negocio');
        }
    }

    async getDashboardStats(params: DashboardStatsParams): Promise<DashboardStats> {
        const { businessId, startDate, endDate, userId, role } = params;

        await this.validateAccess(businessId, userId, role);

        const start = new Date(startDate);
        const end = new Date(endDate);
        // Asegurar que endDate incluya todo el día
        end.setHours(23, 59, 59, 999);

        // Calcular hoy en Bogotá
        const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
        const startOfBogotaToday = new Date(`${todayStr}T00:00:00.000-05:00`);
        const endOfBogotaToday = new Date(startOfBogotaToday.getTime() + 24 * 60 * 60 * 1000);
        const next7Days = new Date(startOfBogotaToday.getTime() + 7 * 24 * 60 * 60 * 1000);

        // ── Ejecutar todas las queries en paralelo para máxima velocidad ──
        const [
            credits,
            movementsInRange,
            scheduleUpcoming,
            creditsByStatus,
        ] = await Promise.all([
            // Todos los créditos del negocio con sus schedules para calcular deuda y top deudores
            prisma.credit.findMany({
                where: { businessId },
                include: {
                    client: { select: { id: true, fullName: true } },
                    paymentSchedule: {
                        select: { id: true, dueDate: true, status: true, scheduledAmount: true, paidAmount: true }
                    },
                    payments: {
                        select: { paymentDate: true },
                        orderBy: { paymentDate: 'desc' },
                        take: 1,
                    },
                },
            }),

            // Movimientos en el rango filtrado (para KPIs financieros y tendencia)
            prisma.cashMovement.findMany({
                where: {
                    businessId,
                    createdAt: { gte: start, lte: end },
                    type: { in: ['payment_received', 'interest_earned', 'withdrawal', 'tithe'] },
                },
                select: {
                    type: true,
                    amount: true,
                    createdAt: true,
                    relatedPaymentId: true,
                },
                orderBy: { createdAt: 'asc' },
            }),

            // Cuotas próximas a vencer (próximos 7 días)
            prisma.paymentSchedule.findMany({
                where: {
                    credit: { businessId, status: { in: ['active', 'overdue'] } },
                    status: { in: ['pending', 'partial', 'overdue'] },
                    dueDate: { gte: startOfBogotaToday, lt: next7Days },
                },
                select: { dueDate: true, scheduledAmount: true, paidAmount: true },
            }),

            // Distribución de cartera por monto (paid usa totalWithInterest, active/overdue usa remainingBalance)
            prisma.credit.groupBy({
                by: ['status'],
                where: { businessId },
                _sum: {
                    remainingBalance: true,
                    totalWithInterest: true,
                },
                _count: { id: true },
            }),
        ]);

        // ── Cálculo de KPIs ──
        // totalAdeudado: suma del saldo total de todos los créditos activos/vencidos
        // carteraVencida: SOLO la suma de cuotas YA VENCIDAS y no pagadas (no futuras)
        // carteraAlDia: saldo que aún no está vencido (totalAdeudado - carteraVencida)
        const activeCredits = credits.filter(c => c.status === 'active' || c.status === 'overdue');

        let totalAdeudado = 0;
        let carteraVencida = 0;
        let creditosActivos = 0;
        let creditosVencidos = 0;
        let cobrosHoy = 0;

        for (const credit of activeCredits) {
            const saldo = Number(credit.remainingBalance);
            totalAdeudado += saldo;

            // Sumar solo el pendiente de cuotas vencidas (no el saldo completo del crédito)
            let montoVencidoDeEsteCredito = 0;
            for (const s of credit.paymentSchedule) {
                if (s.dueDate < startOfBogotaToday &&
                    s.status !== 'paid' &&
                    Number(s.scheduledAmount) > Number(s.paidAmount)) {
                    montoVencidoDeEsteCredito += Number(s.scheduledAmount) - Number(s.paidAmount);
                }
            }
            carteraVencida += montoVencidoDeEsteCredito;

            // Contar créditos por estado (en mora si tiene al menos una cuota vencida)
            if (montoVencidoDeEsteCredito > 0 || credit.status === 'overdue') {
                creditosVencidos++;
            } else {
                creditosActivos++;
            }

            // Cobros hoy: cuotas que vencen hoy con saldo
            const hasDueToday = credit.paymentSchedule.some(s =>
                s.dueDate >= startOfBogotaToday &&
                s.dueDate < endOfBogotaToday &&
                s.status !== 'paid' &&
                Number(s.scheduledAmount) > Number(s.paidAmount)
            );
            if (hasDueToday) cobrosHoy++;
        }

        // Cartera al día = lo que aún no está vencido (todo el saldo menos lo ya vencido)
        const carteraAlDia = totalAdeudado - carteraVencida;

        // Pagos, donaciones, retiros y diezmos en el período
        let pagosRecibidos = 0;
        let donacionesRecibidas = 0;
        let gananciaRealizada = 0;
        let totalRetiros = 0;
        let totalDiezmos = 0;

        for (const mov of movementsInRange) {
            const amount = Number(mov.amount);
            if (mov.type === 'payment_received') {
                pagosRecibidos += amount;
            } else if (mov.type === 'interest_earned') {
                gananciaRealizada += amount;
                // Si tiene relatedPaymentId, es una donación inmediata (no profit al cierre)
                if (mov.relatedPaymentId) {
                    donacionesRecibidas += amount;
                }
            } else if (mov.type === 'withdrawal') {
                totalRetiros += Math.abs(amount);
            } else if (mov.type === 'tithe') {
                totalDiezmos += Math.abs(amount);
            }
        }

        // Créditos nuevos en el rango
        const creditosNuevos = credits.filter(c =>
            c.createdAt >= start && c.createdAt <= end
        ).length;

        // ── Top deudores: ordenar créditos activos/overdue por saldo desc ──
        const topDeudores = activeCredits
            .map(credit => {
                const cuotasVencidas = credit.paymentSchedule.filter(s =>
                    s.dueDate < startOfBogotaToday &&
                    s.status !== 'paid' &&
                    Number(s.scheduledAmount) > Number(s.paidAmount)
                ).length;
                return {
                    clientId: credit.client.id,
                    creditId: credit.id,
                    fullName: credit.client.fullName,
                    saldo: Number(credit.remainingBalance),
                    cuotasVencidas,
                    ultimaFechaPago: credit.payments[0]?.paymentDate.toISOString() ?? null,
                };
            })
            .filter(d => d.saldo > 0)
            .sort((a, b) => b.saldo - a.saldo)
            .slice(0, 10);

        // ── Tendencia de pagos: agrupar payment_received por día ──
        const tendenciaMap = new Map<string, number>();
        for (const mov of movementsInRange) {
            if (mov.type !== 'payment_received') continue;
            const dateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(mov.createdAt);
            tendenciaMap.set(dateStr, (tendenciaMap.get(dateStr) || 0) + Number(mov.amount));
        }
        // Llenar días faltantes con 0 entre start y end
        const tendenciaPagos: Array<{ fecha: string; monto: number }> = [];
        const cursor = new Date(start);
        while (cursor <= end) {
            const dateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(cursor);
            tendenciaPagos.push({ fecha: dateStr, monto: tendenciaMap.get(dateStr) || 0 });
            cursor.setDate(cursor.getDate() + 1);
        }

        // ── Próximos vencimientos: agrupar por día ──
        const vencMap = new Map<string, { cantidad: number; monto: number }>();
        for (const s of scheduleUpcoming) {
            const dateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(s.dueDate);
            const pendiente = Number(s.scheduledAmount) - Number(s.paidAmount);
            const existing = vencMap.get(dateStr) || { cantidad: 0, monto: 0 };
            vencMap.set(dateStr, {
                cantidad: existing.cantidad + 1,
                monto: existing.monto + pendiente,
            });
        }
        const proximosVencimientos = Array.from(vencMap.entries())
            .map(([fecha, v]) => ({ fecha, ...v }))
            .sort((a, b) => a.fecha.localeCompare(b.fecha));

        // ── Distribución de cartera por monto ──
        const distribucionCartera = {
            activos: 0,
            vencidos: 0,
            pagados: 0,
        };
        for (const grp of creditsByStatus) {
            const monto = Number(grp._sum.remainingBalance || 0);
            const montoTotal = Number(grp._sum.totalWithInterest || 0);
            if (grp.status === 'active') distribucionCartera.activos += monto;
            else if (grp.status === 'overdue') distribucionCartera.vencidos += monto;
            else if (grp.status === 'paid') distribucionCartera.pagados += montoTotal;
        }

        return {
            kpis: {
                totalAdeudado,
                carteraAlDia,
                carteraVencida,
                pagosRecibidos,
                donacionesRecibidas,
                gananciaRealizada,
                creditosNuevos,
                creditosActivos,
                creditosVencidos,
                cobrosHoy,
                totalRetiros,
                totalDiezmos,
            },
            topDeudores,
            tendenciaPagos,
            proximosVencimientos,
            distribucionCartera,
        };
    }
}

export const dashboardService = new DashboardService();
