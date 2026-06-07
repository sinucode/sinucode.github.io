import jsPDF from 'jspdf';
import { CloseReport } from '../api/accounts.api';

const FM = (v: number) => `$${Math.ceil(Math.abs(v)).toLocaleString('es-CO')}`;
// Formato con signo: -$500.000 para egresos, +$500.000 para ingresos
const FMS = (v: number) => `${v >= 0 ? '+' : '-'}$${Math.ceil(Math.abs(v)).toLocaleString('es-CO')}`;
const FH = (d: string) =>
    new Date(d).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota' });
const FDate = (dateStr: string) => {
    const [y, m, day] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, day).toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' });
};

const TYPE_LABELS: Record<string, string> = {
    capital_injection:  'Inyección capital',
    withdrawal:         'Retiro',
    internal_transfer:  'Transferencia',
    interest_earned:    'Interés/Donación',
    initial_capital:    'Capital inicial',
    expense:            'Gasto',
    loan_disbursement:  'Desembolso',
    credit_cancellation:'Cancelación',
    payment_reversion:  'Reversión de pago',
    tithe:              'Diezmo',
};

/** Dibuja una fila de tabla (texto truncado si supera ancho de columna). */
function tableRow(doc: jsPDF, cols: Array<{ x: number; text: string; bold?: boolean; maxW?: number }>, y: number) {
    for (const col of cols) {
        doc.setFont('helvetica', col.bold ? 'bold' : 'normal');
        const txt = col.maxW
            ? doc.splitTextToSize(col.text, col.maxW)[0] ?? ''
            : col.text;
        doc.text(txt, col.x, y);
    }
    doc.setFont('helvetica', 'normal');
}

export function generateCloseReportPdf(report: CloseReport) {
    const { meta, accounts, payments, collectors, disbursements, disbursers, cancellations, operations, totals } = report;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });

    const LM  = 14;     // margen izquierdo
    const RM  = 196;    // margen derecho
    const PW  = 210;    // ancho página
    const PH  = 297;    // alto página
    const BOT = 280;    // límite inferior antes de nueva página

    const statusLabel =
        meta.close?.status === 'closed'   ? '[CERRADO]'
        : meta.close?.status === 'reopened' ? '[REABIERTO]'
        : '[ABIERTO - sin cierre registrado]';

    let y = 20;

    const checkPage = (needed = 10) => {
        if (y + needed > BOT) { doc.addPage(); y = 18; }
    };

    // ═══ ENCABEZADO ═══
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('REPORTE DE CIERRE DE CAJA', PW / 2, y, { align: 'center' });
    y += 7;

    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text(meta.businessName, PW / 2, y, { align: 'center' });
    y += 6;

    doc.setFontSize(9);
    doc.text(`Fecha: ${FDate(meta.date)}   ·   Estado: ${statusLabel}`, PW / 2, y, { align: 'center' });
    if (meta.close) {
        y += 5;
        doc.text(
            `Cerrado el ${FH(meta.close.closedAt)} · Modo: ${meta.close.closeMode === 'auto' ? 'Automático' : 'Manual'}`,
            PW / 2, y, { align: 'center' }
        );
    }
    y += 5;
    doc.setDrawColor(180, 180, 180);
    doc.line(LM, y, RM, y);
    y += 8;

    // ═══ KPIs ═══
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('RESUMEN DEL DÍA', LM, y);
    y += 6;

    const kpiCols = 3;
    const kpiW   = (RM - LM) / kpiCols;
    const kpis = [
        ['Pagos recibidos', String(totals.numPagos)],
        ['Total cobrado',   FM(totals.totalCobrado)],
        ['Ingresos',        FM(totals.totalIngresos)],
        ['Egresos',         FM(totals.totalEgresos)],
        ['Neto del día',    FM(totals.neto)],
    ];

    kpis.forEach(([label, val], i) => {
        const col = i % kpiCols;
        const x   = LM + col * kpiW;
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.text(label, x, y);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.text(val, x, y + 5);
        doc.setFont('helvetica', 'normal');
        if (col === kpiCols - 1 || i === kpis.length - 1) y += 12;
    });

    y += 2;
    doc.line(LM, y, RM, y);
    y += 8;

    // ═══ TABLA DE CUENTAS ═══
    checkPage(30);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('SALDO POR CUENTA', LM, y);
    y += 6;

    const hasContado = accounts.some(a => a.contado !== null);
    // Columnas: Cuenta(28) Apertura(21) Ingresos(21) Inyección(21) Traslados(21) Egresos(21) Esperado(22) [Contado(22)] [Dif(20)]
    // Total sin contado: 155mm; con contado: 197mm — cabe en A4 (182mm útiles = RM-LM)
    const aC = [LM, LM + 28, LM + 49, LM + 70, LM + 91, LM + 112, LM + 133, LM + 155, LM + 177];

    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.text('Cuenta',    aC[0], y);
    doc.text('Apertura',  aC[1], y);
    doc.text('Ingresos',  aC[2], y);
    doc.text('Inyección', aC[3], y);
    doc.text('Traslados', aC[4], y);
    doc.text('Egresos',   aC[5], y);
    doc.text('Esperado',  aC[6], y);
    if (hasContado) {
        doc.text('Contado',    aC[7], y);
        doc.text('Diferencia', aC[8], y);
    }
    y += 4;
    doc.setDrawColor(200, 200, 200);
    doc.line(LM, y, RM, y);
    y += 4;

    doc.setFontSize(8);
    for (const a of accounts) {
        checkPage(7);
        const traslados = (a as any).traslados ?? 0;
        const inyeccion = (a as any).inyeccion ?? 0;
        tableRow(doc, [
            { x: aC[0], text: a.name.slice(0, 15), maxW: 26 },
            { x: aC[1], text: FM(a.apertura) },
            { x: aC[2], text: a.ingresos !== 0 ? FMS(Math.abs(a.ingresos)) : '$0' },
            { x: aC[3], text: inyeccion !== 0 ? `+${FM(inyeccion)}` : '—' },
            { x: aC[4], text: traslados !== 0 ? FMS(traslados) : '—' },
            { x: aC[5], text: a.egresos !== 0 ? FMS(a.egresos) : '$0' },
            { x: aC[6], text: FM(a.esperado), bold: true },
        ], y);
        if (hasContado) {
            doc.text(a.contado !== null ? FM(a.contado) : '—', aC[7], y);
            const dif = a.diferencia;
            if (dif !== null) {
                doc.setTextColor(dif < 0 ? 200 : 20, dif < 0 ? 30 : 150, 30);
                doc.text(FM(dif), aC[8], y);
                doc.setTextColor(0, 0, 0);
            } else {
                doc.text('—', aC[8], y);
            }
        }
        y += 6;
    }
    y += 4;

    // ═══ LIQUIDACIÓN POR COBRADOR ═══
    if (collectors && collectors.length > 0) {
        checkPage(20);
        doc.setDrawColor(180, 180, 180);
        doc.line(LM, y, RM, y);
        y += 6;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text(`LIQUIDACIÓN POR COBRADOR`, LM, y);
        y += 6;

        const allCuentas = Array.from(new Set(collectors.flatMap(c => c.porCuenta.map(pc => pc.cuenta))));
        // Columnas: Cobrador(50) Pagos(15) + cuentas dinámicas(25 c/u) + Total(25)
        const colW = Math.min(25, Math.floor((RM - LM - 50 - 15 - 25) / Math.max(allCuentas.length, 1)));
        const cC: number[] = [LM, LM + 50, LM + 65];
        allCuentas.forEach((_, i) => cC.push((cC[2] || 0) + i * colW));
        const totalCol = cC[2] + allCuentas.length * colW;

        doc.setFontSize(7.5);
        doc.text('Cobrador', cC[0], y);
        doc.text('Pagos', cC[1], y);
        allCuentas.forEach((cuenta, i) => doc.text(cuenta.slice(0, 12), cC[2] + i * colW, y));
        doc.text('Total', totalCol, y);
        y += 4;
        doc.setDrawColor(200, 200, 200);
        doc.line(LM, y, RM, y);
        y += 4;

        doc.setFontSize(8);
        for (const c of collectors) {
            checkPage(7);
            doc.setFont('helvetica', 'normal');
            doc.text(c.cobradorNombre.slice(0, 22), cC[0], y);
            doc.text(String(c.numPagos), cC[1], y);
            allCuentas.forEach((cuenta, i) => {
                const e = c.porCuenta.find(pc => pc.cuenta === cuenta);
                doc.text(e ? FM(e.monto) : '—', cC[2] + i * colW, y);
            });
            doc.setFont('helvetica', 'bold');
            doc.text(FM(c.totalCobrado), totalCol, y);
            y += 6;
        }
        y += 4;
    }

    // ═══ CRÉDITOS COLOCADOS DEL DÍA (filas individuales) ═══
    {
        checkPage(20);
        doc.setDrawColor(180, 180, 180);
        doc.line(LM, y, RM, y);
        y += 6;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text(`CRÉDITOS COLOCADOS (${disbursements?.length ?? 0})`, LM, y);
        y += 6;

        // Hora(12) Cliente(40) Monto(30) SalioDe(68: desc 48 + monto 20) ColocadoPor(resto)
        const dC2 = [LM, LM + 12, LM + 52, LM + 82, LM + 150];
        const SALIO_DESC_X = LM + 82;   // descripción dentro de "Salió de"
        const SALIO_AMT_X  = LM + 132;  // monto individual del split
        doc.setFontSize(7.5);
        doc.text('Hora',         dC2[0], y);
        doc.text('Cliente',      dC2[1], y);
        doc.text('Monto',        dC2[2], y);
        doc.text('Salió de',     SALIO_DESC_X, y);
        doc.text('Colocado por', dC2[4], y);
        y += 4;
        doc.setDrawColor(200, 200, 200);
        doc.line(LM, y, RM, y);
        y += 4;

        doc.setFontSize(8);
        if (!disbursements || disbursements.length === 0) {
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(140, 140, 140);
            doc.text('Sin créditos colocados en este día.', LM, y);
            doc.setTextColor(0, 0, 0);
            y += 8;
        } else {
            for (const d of disbursements) {
                const splits = d.splits ?? [];
                const numLines = splits.length > 0 ? splits.length : 1;
                const rowH = numLines === 1 ? 6 : numLines * 5.5 + 1;
                checkPage(rowH + 2);
                // Columnas comunes: hora, cliente, monto total, colocado por
                tableRow(doc, [
                    { x: dC2[0], text: FH(d.hora) },
                    { x: dC2[1], text: d.cliente, maxW: 38 },
                    { x: dC2[2], text: FM(d.monto), bold: true },
                    { x: dC2[4], text: d.usuario, maxW: 44 },
                ], y);
                // Columna "Salió de": splits con descripción+monto individual, o nombre de cuenta
                if (splits.length > 0) {
                    doc.setFontSize(7.5);
                    splits.forEach((s, i) => {
                        const sy = y + i * 5.5;
                        const label = s.descripcion ?? s.cuenta;
                        doc.setFont('helvetica', 'normal');
                        doc.text(doc.splitTextToSize(label, 47)[0] ?? label, SALIO_DESC_X, sy);
                        doc.setFont('helvetica', 'bold');
                        doc.text(FM(s.monto), SALIO_AMT_X, sy);
                    });
                    doc.setFontSize(8);
                    doc.setFont('helvetica', 'normal');
                } else {
                    doc.setFont('helvetica', 'normal');
                    doc.text(doc.splitTextToSize(d.cuenta, 65)[0] ?? d.cuenta, SALIO_DESC_X, y);
                }
                y += rowH;
            }
            if (disbursements.length > 1) {
                checkPage(7);
                doc.setFont('helvetica', 'bold');
                doc.text('TOTAL', dC2[1], y);
                doc.text(FM(disbursements.reduce((s, d) => s + Number(d.monto), 0)), dC2[2], y);
                doc.setFont('helvetica', 'normal');
                y += 6;
            }
            y += 4;
        }
    }

    // ═══ CRÉDITOS COLOCADOS POR USUARIO (resumen) ═══
    if (disbursers && disbursers.length > 0) {
        checkPage(20);
        doc.setDrawColor(180, 180, 180);
        doc.line(LM, y, RM, y);
        y += 6;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text(`RESUMEN DE CRÉDITOS POR ASESOR (${disbursers.length})`, LM, y);
        y += 6;

        const dC = [LM, LM + 100, LM + 135];
        doc.setFontSize(7.5);
        doc.text('Usuario',             dC[0], y);
        doc.text('Créditos',            dC[1], y);
        doc.text('Total desembolsado',  dC[2], y);
        y += 4;
        doc.setDrawColor(200, 200, 200);
        doc.line(LM, y, RM, y);
        y += 4;

        doc.setFontSize(8);
        for (const d of disbursers) {
            checkPage(7);
            doc.setFont('helvetica', 'normal');
            doc.text(d.usuarioNombre.slice(0, 35), dC[0], y);
            doc.text(String(d.numCreditos),         dC[1], y);
            doc.setFont('helvetica', 'bold');
            doc.text(FM(d.totalDesembolsado),        dC[2], y);
            y += 6;
        }
        if (disbursers.length > 1) {
            doc.setFont('helvetica', 'bold');
            doc.text('Total', dC[0], y);
            doc.text(String(disbursers.reduce((s, d) => s + d.numCreditos, 0)), dC[1], y);
            doc.text(FM(disbursers.reduce((s, d) => s + d.totalDesembolsado, 0)), dC[2], y);
            y += 8;
        } else {
            y += 4;
        }
    }

    // ═══ CANCELACIONES DEL DÍA ═══
    if (cancellations && cancellations.length > 0) {
        checkPage(20);
        doc.setDrawColor(180, 180, 180);
        doc.line(LM, y, RM, y);
        y += 6;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text(`CANCELACIONES DEL DÍA (${cancellations.length})`, LM, y);
        y += 6;

        const xC = [LM, LM + 52, LM + 102, LM + 140, LM + 166];
        doc.setFontSize(7.5);
        doc.text('Cliente',           xC[0], y);
        doc.text('Apertura',          xC[1], y);
        doc.text('Capital devuelto',  xC[2], y);
        doc.text('Capital regresó a', xC[3], y);
        doc.text('Usuario',           xC[4], y);
        y += 4;
        doc.setDrawColor(200, 200, 200);
        doc.line(LM, y, RM, y);
        y += 4;

        doc.setFontSize(8);
        for (const c of cancellations) {
            checkPage(7);
            const apertura = c.fechaApertura
                ? new Date(c.fechaApertura).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' })
                : '—';
            tableRow(doc, [
                { x: xC[0], text: c.cliente,       maxW: 48 },
                { x: xC[1], text: apertura },
                { x: xC[2], text: FM(c.montoDevuelto), bold: true },
                { x: xC[3], text: c.cuentaOrigen,  maxW: 24 },
                { x: xC[4], text: c.usuario,        maxW: 28 },
            ], y);
            y += 6;
        }
        y += 4;
    }

    // ═══ TABLA DE PAGOS ═══
    if (payments.length > 0) {
        checkPage(20);
        doc.setDrawColor(180, 180, 180);
        doc.line(LM, y, RM, y);
        y += 6;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text(`PAGOS DEL DÍA (${payments.length})`, LM, y);
        y += 6;

        // Hora(14) Cliente(42) Cuota(16) Monto(26) Cuenta(30) Cobrador(resto)
        const pC = [LM, LM + 14, LM + 56, LM + 72, LM + 98, LM + 128];
        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'bold');
        doc.text('Hora',     pC[0], y);
        doc.text('Cliente',  pC[1], y);
        doc.text('Cuota',    pC[2], y);
        doc.text('Monto',    pC[3], y);
        doc.text('Cuenta',   pC[4], y);
        doc.text('Cobrador', pC[5], y);
        y += 4;
        doc.setDrawColor(200, 200, 200);
        doc.line(LM, y, RM, y);
        y += 4;

        doc.setFontSize(8);
        for (const p of payments) {
            checkPage(7);
            tableRow(doc, [
                { x: pC[0], text: FH(p.hora) },
                { x: pC[1], text: p.clienteNombre, maxW: 40 },
                { x: pC[2], text: p.cuotaNumero !== null ? `#${p.cuotaNumero}` : '—' },
                { x: pC[3], text: FM(p.monto), bold: true },
                { x: pC[4], text: p.cuenta, maxW: 28 },
                { x: pC[5], text: p.cobrador, maxW: 50 },
            ], y);
            y += 6;
        }
        if (payments.length > 1) {
            checkPage(7);
            doc.setFont('helvetica', 'bold');
            doc.text('TOTAL', pC[1], y);
            doc.text(FM(payments.reduce((s, p) => s + Number(p.monto), 0)), pC[3], y);
            doc.setFont('helvetica', 'normal');
            y += 6;
        }
        y += 4;
    } else {
        checkPage(12);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(140, 140, 140);
        doc.text('Sin pagos registrados en este día.', LM, y);
        doc.setTextColor(0, 0, 0);
        y += 8;
    }

    // ═══ GASTOS Y RETIROS DEL DÍA ═══
    const gastos = operations.filter(op => ['withdrawal', 'tithe'].includes(op.tipo));
    if (gastos.length > 0) {
        checkPage(20);
        doc.setDrawColor(180, 180, 180);
        doc.line(LM, y, RM, y);
        y += 6;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text(`GASTOS Y RETIROS (${gastos.length})`, LM, y);
        y += 6;

        const gC = [LM, LM + 14, LM + 48, LM + 92, LM + 120, LM + 150];
        doc.setFontSize(7.5);
        doc.text('Hora',        gC[0], y);
        doc.text('Tipo',        gC[1], y);
        doc.text('Para que',    gC[2], y);
        doc.text('Salio de',    gC[3], y);
        doc.text('Monto',       gC[4], y);
        doc.text('Usuario',     gC[5], y);
        y += 4;
        doc.setDrawColor(200, 200, 200);
        doc.line(LM, y, RM, y);
        y += 4;

        doc.setFontSize(8);
        for (const op of gastos) {
            checkPage(7);
            tableRow(doc, [
                { x: gC[0], text: FH(op.hora) },
                { x: gC[1], text: (TYPE_LABELS[op.tipo] || op.tipo), maxW: 32 },
                { x: gC[2], text: op.descripcion || '—', maxW: 42 },
                { x: gC[3], text: op.cuenta, maxW: 26 },
                { x: gC[4], text: FMS(op.efectoSignado), bold: true },
                { x: gC[5], text: op.usuario, maxW: 44 },
            ], y);
            y += 6;
        }
        if (gastos.length > 1) {
            checkPage(7);
            doc.setFont('helvetica', 'bold');
            doc.text('TOTAL', gC[1], y);
            doc.text(FMS(gastos.reduce((s, op) => s + op.efectoSignado, 0)), gC[4], y);
            doc.setFont('helvetica', 'normal');
            y += 6;
        }
        y += 4;
    }

    // ═══ OTRAS OPERACIONES DEL DÍA ═══
    const otrasOps = operations.filter(op => !['withdrawal', 'tithe'].includes(op.tipo));
    if (otrasOps.length > 0) {
        checkPage(20);
        doc.setDrawColor(180, 180, 180);
        doc.line(LM, y, RM, y);
        y += 6;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text(`OTRAS OPERACIONES (${otrasOps.length})`, LM, y);
        y += 6;

        // Hora(14) Tipo(34) Descripción(44) Cuenta(28) Monto(26) Usuario(resto)
        const oC = [LM, LM + 14, LM + 48, LM + 92, LM + 120, LM + 148];
        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'bold');
        doc.text('Hora',       oC[0], y);
        doc.text('Tipo',       oC[1], y);
        doc.text('Descripcion',oC[2], y);
        doc.text('Cuenta',     oC[3], y);
        doc.text('Monto',      oC[4], y);
        doc.text('Usuario',    oC[5], y);
        y += 4;
        doc.setDrawColor(200, 200, 200);
        doc.line(LM, y, RM, y);
        y += 4;

        doc.setFontSize(8);
        for (const op of otrasOps) {
            checkPage(7);
            tableRow(doc, [
                { x: oC[0], text: FH(op.hora) },
                { x: oC[1], text: (TYPE_LABELS[op.tipo] || op.tipo), maxW: 32 },
                { x: oC[2], text: op.descripcion || '—', maxW: 42 },
                { x: oC[3], text: op.cuenta, maxW: 26 },
                { x: oC[4], text: FMS(op.efectoSignado), bold: true },
                { x: oC[5], text: op.usuario, maxW: 44 },
            ], y);
            y += 6;
        }
    }

    // ═══ PIE DE PÁGINA EN TODAS LAS HOJAS ═══
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(140, 140, 140);
        doc.text(
            `GestionCrediFacil · Generado ${new Date().toLocaleString('es-CO')} · Pág ${i}/${totalPages}`,
            PW / 2, PH - 6, { align: 'center' }
        );
        doc.setTextColor(0, 0, 0);
    }

    doc.save(`cierre-${meta.date}-${meta.businessName.replace(/\s+/g, '_')}.pdf`);
}
