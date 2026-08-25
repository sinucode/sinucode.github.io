import { Prisma, UserRole } from '@prisma/client';
import prisma from '../config/database';
import { cashService } from './cash.service';
import { accountService } from './account.service';

const TITHE_RATE = 0.10; // 10% del diezmo

interface TitheCreditItem {
    creditId: string;
    clientName: string;
    capital: number;
    totalPaid: number;
    rentabilidad: number;   // ganancia realizada (totalPaid - capital)
    tithe: number;          // 10% de la rentabilidad
    tithePaid: boolean;
    tithePaidAt: Date | null;
    completionDate: Date | null;
}

export class TitheService {
    private ensureSuperAdmin(role: UserRole) {
        if (role !== 'super_admin') {
            throw new Error('Solo el Super Admin puede acceder al módulo de diezmo');
        }
    }

    /**
     * Resumen del diezmo para un negocio: lista los créditos pagados con
     * rentabilidad > 0, su diezmo (10%) y el estado (pagado / pendiente).
     */
    async getSummary(businessId: string, role: UserRole) {
        this.ensureSuperAdmin(role);

        const business = await prisma.business.findUnique({
            where: { id: businessId },
            select: { id: true, name: true, currentBalance: true },
        });
        if (!business) throw new Error('Negocio no encontrado');

        const credits = await prisma.credit.findMany({
            where: { businessId, status: 'paid' },
            select: {
                id: true,
                amount: true,
                completionDate: true,
                tithePaid: true,
                tithePaidAt: true,
                client: { select: { fullName: true } },
                payments: { select: { amount: true } },
            },
            orderBy: { completionDate: 'desc' },
        });

        const items: TitheCreditItem[] = [];
        for (const c of credits) {
            const capital = Number(c.amount);
            const totalPaid = c.payments.reduce((s, p) => s + Number(p.amount), 0);
            const rentabilidad = Math.round((totalPaid - capital) * 100) / 100;
            if (rentabilidad <= 0) continue; // solo créditos con rentabilidad positiva

            items.push({
                creditId: c.id,
                clientName: c.client.fullName,
                capital,
                totalPaid,
                rentabilidad,
                tithe: Math.round(rentabilidad * TITHE_RATE * 100) / 100,
                tithePaid: c.tithePaid,
                tithePaidAt: c.tithePaidAt,
                completionDate: c.completionDate,
            });
        }

        const pendientes = items.filter(i => !i.tithePaid);
        const pagados = items.filter(i => i.tithePaid);

        return {
            business: { id: business.id, name: business.name, currentBalance: Number(business.currentBalance) },
            titheRate: TITHE_RATE,
            items,
            totals: {
                rentabilidadTotal: Math.round(items.reduce((s, i) => s + i.rentabilidad, 0) * 100) / 100,
                diezmoPendiente: Math.round(pendientes.reduce((s, i) => s + i.tithe, 0) * 100) / 100,
                diezmoPagado: Math.round(pagados.reduce((s, i) => s + i.tithe, 0) * 100) / 100,
                countPendiente: pendientes.length,
                countPagado: pagados.length,
            },
        };
    }

    /**
     * Aprueba y paga el diezmo de los créditos seleccionados: descuenta de la
     * caja, marca los créditos como diezmo pagado y registra el lote.
     */
    async payTithe(params: { businessId: string; creditIds: string[]; accountId?: string; userId: string; role: UserRole; ipAddress?: string }) {
        const { businessId, creditIds, accountId, userId, role, ipAddress } = params;
        this.ensureSuperAdmin(role);

        if (!Array.isArray(creditIds) || creditIds.length === 0) {
            throw new Error('Debe seleccionar al menos un crédito');
        }

        // Resolver la cuenta de origen (la enviada, si es válida, si no la cuenta por defecto)
        const effectiveAccountId = await cashService.resolveAccountId(businessId, accountId);
        const { accounts: accList } = await accountService.getBalances(businessId, userId, role);
        const account = accList.find(a => a.id === effectiveAccountId);

        return prisma.$transaction(async (tx) => {
            const business = await tx.business.findUnique({
                where: { id: businessId },
                select: { id: true, name: true, currentBalance: true },
            });
            if (!business) throw new Error('Negocio no encontrado');

            const credits = await tx.credit.findMany({
                where: { id: { in: creditIds }, businessId, status: 'paid' },
                select: {
                    id: true,
                    amount: true,
                    tithePaid: true,
                    client: { select: { fullName: true } },
                    payments: { select: { amount: true } },
                },
            });

            if (credits.length !== creditIds.length) {
                throw new Error('Uno o más créditos no pertenecen al negocio, no están pagados o no existen');
            }

            // Calcular rentabilidad y diezmo total (omitiendo los ya pagados)
            let totalProfit = 0;
            let titheAmount = 0;
            const validIds: string[] = [];
            for (const c of credits) {
                if (c.tithePaid) continue; // ya tiene diezmo pagado, se ignora
                const rentabilidad = c.payments.reduce((s, p) => s + Number(p.amount), 0) - Number(c.amount);
                if (rentabilidad <= 0) continue;
                totalProfit += rentabilidad;
                titheAmount += rentabilidad * TITHE_RATE;
                validIds.push(c.id);
            }

            if (validIds.length === 0) {
                throw new Error('Los créditos seleccionados no tienen diezmo pendiente');
            }

            totalProfit = Math.round(totalProfit * 100) / 100;
            titheAmount = Math.round(titheAmount * 100) / 100;

            const currentBalance = Number(business.currentBalance);
            if (currentBalance < titheAmount) {
                throw new Error(
                    `Fondos insuficientes en caja. Saldo: $${currentBalance.toLocaleString('es-CO')}, ` +
                    `diezmo a pagar: $${titheAmount.toLocaleString('es-CO')}`
                );
            }

            if (account && account.balance < titheAmount - 0.01) {
                const err: any = new Error(
                    `Saldo insuficiente en la cuenta "${account.name}". ` +
                    `Disponible: $${Math.ceil(account.balance).toLocaleString('es-CO')}, ` +
                    `diezmo a pagar: $${Math.ceil(titheAmount).toLocaleString('es-CO')}`
                );
                err.code    = 'INSUFFICIENT_ACCOUNT_BALANCE';
                err.details = {
                    accountId:   effectiveAccountId,
                    accountName: account.name,
                    available:   account.balance,
                    required:    titheAmount,
                    scope:       'account',
                };
                throw err;
            }

            const newBalance = new Prisma.Decimal(currentBalance).minus(titheAmount);
            const accountLabel = account ? ` | Cuenta: ${account.name}` : '';

            // Registrar el lote de diezmo
            const tithePayment = await tx.tithePayment.create({
                data: {
                    businessId,
                    totalProfit: new Prisma.Decimal(totalProfit),
                    titheAmount: new Prisma.Decimal(titheAmount),
                    creditCount: validIds.length,
                    approvedById: userId,
                },
            });

            // Movimiento de caja (egreso) + actualización de saldo + marcar créditos, en paralelo
            await Promise.all([
                tx.cashMovement.create({
                    data: {
                        businessId,
                        type: 'tithe',
                        amount: new Prisma.Decimal(titheAmount),
                        balanceAfter: newBalance,
                        description: `Diezmo de rentabilidad - ${validIds.length} crédito(s) | Base: $${totalProfit.toLocaleString('es-CO')}${accountLabel}`,
                        paymentMethod: account?.name || 'efectivo',
                        accountId: effectiveAccountId,
                        createdById: userId,
                    },
                }),
                tx.business.update({
                    where: { id: businessId },
                    data: { currentBalance: newBalance },
                }),
                tx.credit.updateMany({
                    where: { id: { in: validIds } },
                    data: { tithePaid: true, tithePaidAt: new Date(), tithePaymentId: tithePayment.id },
                }),
                tx.auditLog.create({
                    data: {
                        userId,
                        businessId,
                        action: 'PAY_TITHE',
                        description: `Pagó diezmo de $${titheAmount.toLocaleString('es-CO')} sobre rentabilidad de $${totalProfit.toLocaleString('es-CO')} (${validIds.length} créditos)${accountLabel}`,
                        entityType: 'TithePayment',
                        entityId: tithePayment.id,
                        newValues: { titheAmount, totalProfit, creditIds: validIds, accountId: effectiveAccountId, accountName: account?.name },
                        ipAddress,
                    },
                }),
            ]);

            return {
                success: true,
                tithePaymentId: tithePayment.id,
                titheAmount,
                totalProfit,
                creditsPaid: validIds.length,
                newBalance: Number(newBalance),
            };
        }, { maxWait: 10000, timeout: 20000 });
    }
}

export const titheService = new TitheService();
