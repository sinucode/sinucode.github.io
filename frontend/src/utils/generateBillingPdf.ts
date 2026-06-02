import jsPDF from 'jspdf';
import { BusinessBilling } from '../api/billing.api';

const FM  = (v: number) => `$${Math.ceil(v).toLocaleString('es-CO')}`;
const FDate = (dateStr: string) => {
    const [y, m, day] = dateStr.split('T')[0].split('-').map(Number);
    return new Date(y, m - 1, day).toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' });
};

export function generateBillingPdf(billing: BusinessBilling) {
    const doc  = new jsPDF({ unit: 'mm', format: 'a4' });
    const LM   = 20;
    const RM   = 190;
    let y      = 20;

    // ── Encabezado ──
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 64, 175); // azul
    doc.text('FACTURA DE SERVICIO', LM, y);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text(`N.° ${billing.id.slice(0, 8).toUpperCase()}`, RM, y, { align: 'right' });
    y += 5;
    doc.text(`Emitida: ${new Date(billing.createdAt).toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' })}`, RM, y, { align: 'right' });

    y += 8;
    doc.setDrawColor(30, 64, 175);
    doc.setLineWidth(0.5);
    doc.line(LM, y, RM, y);
    y += 8;

    // ── Datos del negocio ──
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text('FACTURADO A:', LM, y);
    y += 6;
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 64, 175);
    doc.text(billing.businessName, LM, y);
    y += 6;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(80, 80, 80);
    doc.text(`Período facturado: ${FDate(billing.periodStart)} — ${FDate(billing.periodEnd)}`, LM, y);
    y += 12;

    // ── Tabla de detalle ──
    doc.setFillColor(245, 247, 250);
    doc.rect(LM, y - 4, RM - LM, 8, 'F');
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(50, 50, 50);
    doc.text('Descripción',          LM + 2,  y);
    doc.text('Cantidad',             LM + 90, y, { align: 'right' });
    doc.text('Precio unitario',      LM + 130, y, { align: 'right' });
    doc.text('Total',                RM,       y, { align: 'right' });
    y += 4;
    doc.setDrawColor(200, 200, 200);
    doc.line(LM, y, RM, y);
    y += 6;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    const price = Number(billing.pricePerUnit);
    const total = Number(billing.totalAmount);
    doc.text('Créditos creados en el período', LM + 2, y);
    doc.text(String(billing.creditsCount),     LM + 90, y, { align: 'right' });
    doc.text(FM(price),                        LM + 130, y, { align: 'right' });
    doc.text(FM(total),                        RM,       y, { align: 'right' });
    y += 6;

    doc.setDrawColor(200, 200, 200);
    doc.line(LM, y, RM, y);
    y += 8;

    // ── Total ──
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text('TOTAL A PAGAR:', LM + 100, y);
    doc.setFontSize(14);
    doc.setTextColor(30, 64, 175);
    doc.text(FM(total), RM, y, { align: 'right' });
    y += 12;

    // ── Notas ──
    if (billing.notes) {
        doc.setFontSize(9);
        doc.setFont('helvetica', 'italic');
        doc.setTextColor(100, 100, 100);
        doc.text(`Notas: ${billing.notes}`, LM, y);
        y += 8;
    }

    // ── Pie de página ──
    y = 270;
    doc.setDrawColor(200, 200, 200);
    doc.line(LM, y, RM, y);
    y += 5;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(120, 120, 120);
    doc.text('Plataforma GestiónCrediFácil — Factura generada automáticamente', LM, y);
    doc.text(`Página 1`, RM, y, { align: 'right' });

    const fname = `factura-${billing.businessName.replace(/\s+/g, '_')}-${billing.periodStart.slice(0, 7)}.pdf`;
    doc.save(fname);
}
