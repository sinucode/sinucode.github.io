/**
 * backfillAccountIds.ts — Migración one-off IDEMPOTENTE
 *
 * Problemas que corrige:
 *   1. CashMovements sin accountId: los asigna a la cuenta más antigua del negocio
 *      (la "ancla estable"), igual que lo hace account.service.ts en runtime.
 *   2. Capital inicial no registrado como movimiento: crea un cashMovement de tipo
 *      'initial_capital' cuyo monto es el "residual neto" (currentBalance - Σ_movimientos),
 *      de modo que tras el backfill Σ(signedEffect) == currentBalance exactamente y el
 *      offset flotante del reconciliador queda en 0.
 *      Si el residual fuera <= 0 (datos con discrepancia negativa) NO se crea el movimiento;
 *      en ese caso el ancla estable absorbe el offset sin afectar a las demás cuentas.
 *
 * Es seguro ejecutar más de una vez:
 *   - sólo toca filas con accountId IS NULL
 *   - sólo crea initial_capital si no existe ya uno para ese negocio
 *
 * Uso:
 *   npm run backfill:accounts
 */

// Forzar zona horaria Colombia antes de cualquier importación
process.env.TZ = 'America/Bogota';

import { Prisma, CashMovementType } from '@prisma/client';
import prisma from '../config/database';

/** Efecto firmado — alineado con account.service.ts */
function signedEffect(type: CashMovementType, amount: number): number {
    if (type === 'internal_transfer') return amount;
    const income: CashMovementType[] = [
        'payment_received', 'capital_injection', 'interest_earned',
        'initial_capital', 'credit_cancellation',
    ];
    return income.includes(type) ? Math.abs(amount) : -Math.abs(amount);
}

async function run() {
    console.log('=== Backfill accountId + capital inicial ===\n');

    const businesses = await prisma.business.findMany({
        select: { id: true, name: true, initialCapital: true, currentBalance: true, createdAt: true, createdById: true },
        orderBy: { createdAt: 'asc' },
    });

    let totalMovsFixed   = 0;
    let totalCapCreated  = 0;
    let totalCapSkipped  = 0;

    for (const biz of businesses) {
        // 1. Obtener la cuenta ancla: la más antigua del negocio
        const anchor = await prisma.paymentAccount.findFirst({
            where: { businessId: biz.id },
            orderBy: { createdAt: 'asc' },
            select: { id: true, name: true, createdAt: true },
        });

        if (!anchor) {
            console.warn(`  [${biz.name}] Sin cuentas — saltando`);
            continue;
        }

        // 2. Asignar accountId a los movimientos que no lo tienen (idempotente)
        const fixResult = await prisma.cashMovement.updateMany({
            where: { businessId: biz.id, accountId: null },
            data:  { accountId: anchor.id },
        });
        totalMovsFixed += fixResult.count;

        // 3. Calcular el residual neto: lo que falta para que Σ == currentBalance
        //    (o lo que sobra, si negativo — no se crea movimiento en ese caso)
        const existingMovs = await prisma.cashMovement.findMany({
            where: { businessId: biz.id },
            select: { type: true, amount: true },
        });
        const sumExisting  = existingMovs.reduce((s, m) => s + signedEffect(m.type, Number(m.amount)), 0);
        const residual     = Number(biz.currentBalance) - sumExisting;
        const alreadyHasIC = existingMovs.some(m => m.type === 'initial_capital');

        let capitalNote = '';

        if (!alreadyHasIC) {
            if (residual > 0.01) {
                // Crear initial_capital con el monto exacto necesario para cuadrar el saldo
                await prisma.cashMovement.create({
                    data: {
                        businessId:    biz.id,
                        type:          'initial_capital',
                        amount:        new Prisma.Decimal(residual),
                        balanceAfter:  new Prisma.Decimal(Number(biz.currentBalance)),
                        description:   'Capital inicial (backfill)',
                        paymentMethod: anchor.name,
                        accountId:     anchor.id,
                        createdById:   biz.createdById,
                        createdAt:     biz.createdAt,
                    },
                });
                totalCapCreated++;
                capitalNote = `$${Math.round(residual).toLocaleString('es-CO')}`;
            } else if (residual < -0.01) {
                capitalNote = `offset=${Math.round(residual).toLocaleString('es-CO')} — skipped (data discrepancy)`;
                totalCapSkipped++;
            } else {
                capitalNote = 'balance cuadrado, no necesario';
            }
        } else {
            capitalNote = 'ya existe';
        }

        // 4. Verificación final
        const afterMovs = await prisma.cashMovement.findMany({
            where: { businessId: biz.id },
            select: { type: true, amount: true },
        });
        const sumAfter = afterMovs.reduce((s, m) => s + signedEffect(m.type, Number(m.amount)), 0);
        const diff     = Number(biz.currentBalance) - sumAfter;
        const status   = Math.abs(diff) < 0.01 ? '✓ offset=0' : `⚠ offset=${Math.round(diff).toLocaleString('es-CO')}`;

        console.log(
            `[${biz.name}] ancla="${anchor.name}" | movsFijados=${fixResult.count} | ` +
            `capital: ${capitalNote} | ${status}`
        );
    }

    console.log(`\n=== Resumen ===`);
    console.log(`Negocios:               ${businesses.length}`);
    console.log(`Movimientos con cuenta: ${totalMovsFixed}`);
    console.log(`Capital creado:         ${totalCapCreated}`);
    console.log(`Capital omitido:        ${totalCapSkipped} (discrepancia en datos históricos)`);
    console.log('\nBackfill completado.');
}

run()
    .catch(e => { console.error('Error:', e); process.exit(1); })
    .finally(() => prisma.$disconnect());
