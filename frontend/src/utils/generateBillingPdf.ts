import jsPDF from 'jspdf';
import { BusinessBilling, CreditBillingItem } from '../api/billing.api';

const FM   = (v: number) => `$${Math.ceil(v).toLocaleString('es-CO')}`;
const FDate = (dateStr: string) => {
    const [y, m, day] = dateStr.split('T')[0].split('-').map(Number);
    return new Date(y, m - 1, day).toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' });
};
const FShort = (dateStr: string) => {
    const [y, m, day] = dateStr.split('T')[0].split('-').map(Number);
    return new Date(y, m - 1, day).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
};
const STATUS_LABEL: Record<string, string> = {
    active:    'Activo',
    paid:      'Pagado',
    overdue:   'Vencido',
    cancelled: 'Cancelado',
};

export function generateBillingPdf(billing: BusinessBilling, credits: CreditBillingItem[] = []) {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const LM  = 15;
    const RM  = 195;
    let   y   = 18;

    // ───────────────────────────────────────────────
    // Funciones de layout reutilizables
    // ───────────────────────────────────────────────
    const newPage = () => {
        doc.addPage();
        y = 18;
        // Encabezado ligero en páginas 2+
        doc.setFontSize(8);
        doc.setFont('helvetica', 'italic');
        doc.setTextColor(150, 150, 150);
        doc.text(`${billing.businessName} · Factura N.° ${billing.id.slice(0, 8).toUpperCase()} · (continuación)`, LM, y);
        y += 8;
    };
    const checkPageBreak = (needed = 10) => {
        if (y + needed > 272) newPage();
    };

    // ───────────────────────────────────────────────
    // ENCABEZADO
    // ───────────────────────────────────────────────
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 64, 175);
    doc.text('FACTURA DE SERVICIO', LM, y);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text(`N.° ${billing.id.slice(0, 8).toUpperCase()}`, RM, y, { align: 'right' });
    y += 5;
    doc.text(
        `Emitida: ${new Date(billing.createdAt).toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' })}`,
        RM, y, { align: 'right' },
    );

    y += 7;
    doc.setDrawColor(30, 64, 175);
    doc.setLineWidth(0.5);
    doc.line(LM, y, RM, y);
    y += 8;

    // ───────────────────────────────────────────────
    // DATOS DEL NEGOCIO
    // ───────────────────────────────────────────────
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text('FACTURADO A:', LM, y);
    y += 5;
    doc.setFontSize(15);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 64, 175);
    doc.text(billing.businessName, LM, y);
    y += 6;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(80, 80, 80);
    doc.text(`Período: ${FDate(billing.periodStart)} — ${FDate(billing.periodEnd)}`, LM, y);
    y += 10;

    // ───────────────────────────────────────────────
    // TABLA RESUMEN
    // ───────────────────────────────────────────────
    const price = Number(billing.pricePerUnit);
    const total = Number(billing.totalAmount);

    // Header de la tabla resumen
    doc.setFillColor(239, 246, 255);
    doc.rect(LM, y - 4, RM - LM, 8, 'F');
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(50, 50, 50);
    doc.text('Descripción',       LM + 2,   y);
    doc.text('Cant.',             LM + 100, y, { align: 'right' });
    doc.text('Precio unitario',   LM + 140, y, { align: 'right' });
    doc.text('Total',             RM - 2,   y, { align: 'right' });
    y += 3;
    doc.setDrawColor(200, 200, 200);
    doc.line(LM, y, RM, y);
    y += 6;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    doc.text('Créditos creados en el período (cobrables)',  LM + 2,   y);
    doc.text(String(billing.creditsCount),                  LM + 100, y, { align: 'right' });
    doc.text(FM(price),                                     LM + 140, y, { align: 'right' });
    doc.text(FM(total),                                     RM - 2,   y, { align: 'right' });
    y += 5;

    doc.setDrawColor(200, 200, 200);
    doc.line(LM, y, RM, y);
    y += 7;

    // TOTAL A PAGAR
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text('TOTAL A PAGAR:', LM + 95, y);
    doc.setFontSize(13);
    doc.setTextColor(30, 64, 175);
    doc.text(FM(total), RM - 2, y, { align: 'right' });
    y += 10;

    // Notas (si existen)
    if (billing.notes) {
        doc.setFontSize(8);
        doc.setFont('helvetica', 'italic');
        doc.setTextColor(100, 100, 100);
        doc.text(`Notas: ${billing.notes}`, LM, y);
        y += 7;
    }

    // ───────────────────────────────────────────────
    // DETALLE DE CRÉDITOS
    // ───────────────────────────────────────────────
    if (credits.length > 0) {
        checkPageBreak(20);

        y += 3;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(30, 64, 175);
        doc.text('DETALLE DE CRÉDITOS', LM, y);
        y += 4;
        doc.setDrawColor(30, 64, 175);
        doc.setLineWidth(0.3);
        doc.line(LM, y, RM, y);
        y += 5;

        // Cabecera de la tabla de créditos
        const drawCreditHeader = () => {
            doc.setFillColor(245, 247, 250);
            doc.rect(LM, y - 4, RM - LM, 7, 'F');
            doc.setFontSize(8);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(50, 50, 50);
            doc.text('#',         LM + 2,   y);
            doc.text('Cliente',   LM + 10,  y);
            doc.text('Fecha',     LM + 105, y, { align: 'right' });
            doc.text('Monto',     LM + 145, y, { align: 'right' });
            doc.text('Estado',    RM - 2,   y, { align: 'right' });
            y += 3;
            doc.setDrawColor(180, 180, 180);
            doc.setLineWidth(0.2);
            doc.line(LM, y, RM, y);
            y += 5;
        };

        drawCreditHeader();

        let rowNum = 0;
        for (const cr of credits) {
            checkPageBreak(7);
            // Si acabamos de paginar, reponemos la cabecera
            if (y <= 26) drawCreditHeader();

            rowNum++;
            const isCancelled = cr.status === 'cancelled';

            // Fondo alternado suave
            if (rowNum % 2 === 0) {
                doc.setFillColor(250, 250, 252);
                doc.rect(LM, y - 4, RM - LM, 6.5, 'F');
            }

            doc.setFontSize(8);
            doc.setFont('helvetica', isCancelled ? 'italic' : 'normal');
            doc.setTextColor(isCancelled ? 150 : 30, isCancelled ? 150 : 30, isCancelled ? 150 : 30);

            doc.text(String(rowNum),                LM + 2,   y);
            // Nombre del cliente (truncar si es muy largo)
            const nameStr = cr.clientName.length > 35 ? cr.clientName.slice(0, 33) + '…' : cr.clientName;
            doc.text(nameStr,                       LM + 10,  y);
            doc.text(FShort(cr.createdAt),          LM + 105, y, { align: 'right' });

            // Monto: tachado si cancelado
            if (isCancelled) {
                doc.text('—',     LM + 145, y, { align: 'right' });
            } else {
                doc.text(FM(cr.amount), LM + 145, y, { align: 'right' });
            }

            // Estado con color
            const statusLabel = STATUS_LABEL[cr.status] ?? cr.status;
            if (cr.status === 'cancelled') {
                doc.setTextColor(185, 28, 28); // rojo
            } else if (cr.status === 'overdue') {
                doc.setTextColor(180, 83, 9);  // naranja
            } else if (cr.status === 'paid') {
                doc.setTextColor(21, 128, 61); // verde
            } else {
                doc.setTextColor(30, 64, 175); // azul
            }
            doc.setFont('helvetica', 'bold');
            doc.text(statusLabel, RM - 2, y, { align: 'right' });

            y += 6.5;

            // Línea divisoria entre filas
            doc.setDrawColor(235, 235, 235);
            doc.setLineWidth(0.1);
            doc.line(LM, y - 0.5, RM, y - 0.5);
        }

        // Subtotales del detalle
        checkPageBreak(12);
        y += 3;
        const billableCredits = credits.filter(c => c.status !== 'cancelled');
        const cancelledCount  = credits.length - billableCredits.length;

        doc.setDrawColor(100, 100, 100);
        doc.setLineWidth(0.3);
        doc.line(LM, y, RM, y);
        y += 5;

        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(80, 80, 80);
        doc.text(`Total créditos listados: ${credits.length}`, LM + 2, y);
        if (cancelledCount > 0) {
            doc.setTextColor(185, 28, 28);
            doc.text(`Cancelados (sin cobro): ${cancelledCount}`, LM + 70, y);
        }
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(30, 64, 175);
        doc.text(`Cobrables: ${billableCredits.length}  ×  ${FM(price)}  =  ${FM(total)}`, RM - 2, y, { align: 'right' });
    }

    // ───────────────────────────────────────────────
    // PIE DE PÁGINA (última página)
    // ───────────────────────────────────────────────
    const totalPages = (doc as any).internal.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
        doc.setPage(p);
        const footerY = 285;
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.3);
        doc.line(LM, footerY - 3, RM, footerY - 3);
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(130, 130, 130);
        doc.text('Plataforma GestiónCrediFácil — Factura generada automáticamente', LM, footerY);
        doc.text(`Página ${p} de ${totalPages}`, RM, footerY, { align: 'right' });
    }

    const fname = `factura-${billing.businessName.replace(/\s+/g, '_')}-${billing.periodStart.slice(0, 7)}.pdf`;
    doc.save(fname);
}
