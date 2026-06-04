/**
 * diagnoseAccountBalances.ts
 * Script de diagnóstico de saldos por cuenta.
 *
 * Uso:
 *   npx tsx src/scripts/diagnoseAccountBalances.ts <businessId>
 *
 * Si no se pasa businessId, lista los negocios disponibles.
 * Requiere DATABASE_URL en el entorno (backend/.env).
 */
import { PrismaClient, CashMovementType } from '@prisma/client';

const prisma = new PrismaClient();

/** Misma lógica que AccountService.signedEffect */
function signedEffect(type: CashMovementType | string, amount: number): number {
    if (type === 'internal_transfer') return amount; // ya viene con signo
    const income = [
        'payment_received', 'capital_injection', 'interest_earned',
        'initial_capital', 'credit_cancellation',
    ];
    return income.includes(type) ? Math.abs(amount) : -Math.abs(amount);
}

function fmtCOP(n: number): string {
    const sign = n < 0 ? '-' : '';
    return `${sign}$${Math.abs(Math.round(n)).toLocaleString('es-CO')}`;
}

async function main() {
    const businessId = process.argv[2];

    if (!businessId) {
        const businesses = await prisma.business.findMany({
            select: { id: true, name: true, currentBalance: true },
            orderBy: { name: 'asc' },
        });
        console.log('\n📋 Negocios disponibles:\n');
        for (const b of businesses) {
            console.log(`  ${b.id}  →  ${b.name}  (saldo total: ${fmtCOP(Number(b.currentBalance))})`);
        }
        console.log('\nUso: npx tsx src/scripts/diagnoseAccountBalances.ts <businessId>\n');
        return;
    }

    const business = await prisma.business.findUnique({
        where: { id: businessId },
        select: { id: true, name: true, currentBalance: true, initialCapital: true },
    });
    if (!business) {
        console.error(`\n❌ No se encontró el negocio con id: ${businessId}\n`);
        process.exit(1);
    }

    const [accounts, movements] = await Promise.all([
        prisma.paymentAccount.findMany({
            where: { businessId },
            orderBy: [{ createdAt: 'asc' }, { name: 'asc' }],
        }),
        prisma.cashMovement.findMany({
            where: { businessId },
            select: { type: true, amount: true, accountId: true },
        }),
    ]);

    console.log(`\n${'═'.repeat(60)}`);
    console.log(`  Diagnóstico de caja — ${business.name}`);
    console.log(`  Saldo total declarado : ${fmtCOP(Number(business.currentBalance))}`);
    console.log(`  Capital inicial       : ${fmtCOP(Number(business.initialCapital))}`);
    console.log(`  Total movimientos     : ${movements.length}`);
    console.log(`${'═'.repeat(60)}\n`);

    // Ancla = cuenta más antigua
    const anchorAcc = accounts[0];

    // Acumuladores por cuenta
    const balByAcc:   Record<string, number> = {};
    const byTypeAcc:  Record<string, Record<string, number>> = {};
    accounts.forEach(a => {
        balByAcc[a.id]  = 0;
        byTypeAcc[a.id] = {};
    });

    let legacyCount = 0;
    let legacySum   = 0;

    for (const mov of movements) {
        const eff   = signedEffect(mov.type as CashMovementType, Number(mov.amount));
        const accId = mov.accountId && balByAcc[mov.accountId] !== undefined
            ? mov.accountId
            : anchorAcc?.id;

        if (!accId) continue;

        if (!mov.accountId || balByAcc[mov.accountId] === undefined) {
            legacyCount++;
            legacySum += eff;
        }

        balByAcc[accId]  = (balByAcc[accId]  || 0) + eff;
        const t = mov.type as string;
        byTypeAcc[accId][t] = (byTypeAcc[accId][t] || 0) + eff;
    }

    // Reconciliar residual
    const totalMovs    = Object.values(balByAcc).reduce((s, v) => s + v, 0);
    const declared     = Number(business.currentBalance);
    const residual     = declared - totalMovs;
    if (Math.abs(residual) > 0.01 && anchorAcc) {
        balByAcc[anchorAcc.id] += residual;
    }

    // Imprimir por cuenta
    for (const acc of accounts) {
        const bal     = balByAcc[acc.id] || 0;
        const isNeg   = bal < -0.01;
        const marker  = isNeg ? ' ⚠️  NEGATIVO' : '';
        const anchor  = acc.id === anchorAcc?.id ? ' [ANCLA]' : '';

        console.log(`┌─ ${acc.name}${anchor} (${acc.active ? 'activa' : 'inactiva'})`);
        console.log(`│  isDefault: ${acc.isDefault}  isDisbursementDefault: ${acc.isDisbursementDefault}`);
        console.log(`│`);

        const types = byTypeAcc[acc.id] || {};
        const typeOrder = [
            'initial_capital', 'capital_injection',
            'payment_received', 'interest_earned', 'credit_cancellation',
            'loan_disbursement', 'withdrawal', 'tithe', 'payment_reversion',
        ];
        for (const t of typeOrder) {
            if (types[t] !== undefined) {
                const v = types[t];
                const sign = v >= 0 ? '+' : '';
                console.log(`│  ${t.padEnd(24)} ${sign}${fmtCOP(v)}`);
            }
        }
        // Tipos no listados arriba
        for (const t of Object.keys(types)) {
            if (!typeOrder.includes(t)) {
                const v = types[t];
                const sign = v >= 0 ? '+' : '';
                console.log(`│  ${t.padEnd(24)} ${sign}${fmtCOP(v)}`);
            }
        }

        if (acc.id === anchorAcc?.id) {
            if (legacyCount > 0) {
                console.log(`│  (legacy sin cuenta)      ${legacySum >= 0 ? '+' : ''}${fmtCOP(legacySum)}  ← ${legacyCount} movimientos sin accountId`);
            }
            if (Math.abs(residual) > 0.01) {
                console.log(`│  (reconciliación residual) ${residual >= 0 ? '+' : ''}${fmtCOP(residual)}  ← capital inicial / descuadre`);
            }
        }

        console.log(`│`);
        console.log(`└─ SALDO: ${fmtCOP(bal)}${marker}\n`);
    }

    console.log(`${'─'.repeat(60)}`);
    console.log(`  TOTAL suma cuentas    : ${fmtCOP(Object.values(balByAcc).reduce((s, v) => s + v, 0))}`);
    console.log(`  TOTAL declarado       : ${fmtCOP(declared)}`);
    const diff = Math.abs(Object.values(balByAcc).reduce((s, v) => s + v, 0) - declared);
    if (diff > 0.01) {
        console.log(`  ⚠️  DIFERENCIA         : ${fmtCOP(diff)}`);
    } else {
        console.log(`  ✅ Totales cuadran`);
    }
    console.log();

    if (legacyCount > 0) {
        console.log(`ℹ️  ${legacyCount} movimientos sin accountId (legacy) → absorbidos por la cuenta ancla "${anchorAcc?.name}"`);
    }

    const negativas = accounts.filter(a => (balByAcc[a.id] || 0) < -0.01);
    if (negativas.length > 0) {
        console.log(`\n⚠️  Cuentas con saldo negativo:`);
        for (const a of negativas) {
            console.log(`   - ${a.name}: ${fmtCOP(balByAcc[a.id])}`);
        }
        console.log(`\n   Para corregirlo SIN alterar el total:`);
        console.log(`   → Usa "Cambiar dinero de cuenta" (transferencia interna) hacia la cuenta negativa.`);
        console.log(`   → El monto a transferir = el valor negativo (${fmtCOP(Math.abs(balByAcc[negativas[0].id]))}).`);
    } else {
        console.log(`✅ Ninguna cuenta con saldo negativo.`);
    }
    console.log();
}

main()
    .catch(e => { console.error('❌ Error:', e.message); process.exit(1); })
    .finally(() => prisma.$disconnect());
