import jsPDF from 'jspdf';
import { Payment } from '../types';

const formatMoney = (val: any) => `$${Math.ceil(Number(val || 0)).toLocaleString('es-CO')}`;

interface ReceiptData {
    payment: Payment;
    clientName: string;
    creditId: string;
    capital?: number;
    totalWithInterest?: number;
    remainingBalance?: number;
}

/**
 * Dibuja un recibo de pago en el doc PDF en la página actual.
 */
function drawReceipt(doc: jsPDF, data: ReceiptData, yOffset: number = 0): number {
    const { payment, clientName, creditId, capital, totalWithInterest, remainingBalance } = data;
    let y = 20 + yOffset;

    // Encabezado
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('RECIBO DE PAGO', 105, y, { align: 'center' });
    y += 8;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`ID: ${payment.id.slice(0, 8)}...`, 105, y, { align: 'center' });
    y += 4;
    doc.line(14, y, 196, y);
    y += 8;

    // Cliente
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('CLIENTE', 14, y);
    y += 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Nombre: ${clientName}`, 14, y);
    y += 6;
    doc.text(`Crédito ID: ${creditId.slice(0, 12)}...`, 14, y);
    y += 10;

    // Pago
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('DETALLES DEL PAGO', 14, y);
    y += 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Fecha: ${new Date(payment.paymentDate).toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' })}`, 14, y);
    y += 6;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(`Monto: ${formatMoney(payment.amount)}`, 14, y);
    y += 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Método: ${payment.paymentMethod || 'Efectivo'}`, 14, y);
    y += 6;
    if (Number(payment.amountToInterest || 0) > 0) {
        doc.text(`Aplicado a deuda: ${formatMoney(payment.amountToPrincipal)}`, 14, y);
        y += 6;
        doc.text(`Donación al negocio: ${formatMoney(payment.amountToInterest)}`, 14, y);
        y += 6;
    }
    if (payment.notes) {
        doc.text(`Notas: ${payment.notes}`, 14, y);
        y += 6;
    }
    y += 4;

    // Información del crédito
    if (capital !== undefined || totalWithInterest !== undefined || remainingBalance !== undefined) {
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text('INFORMACIÓN DEL CRÉDITO', 14, y);
        y += 6;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        if (capital !== undefined) {
            doc.text(`Capital: ${formatMoney(capital)}`, 14, y);
            y += 6;
        }
        if (totalWithInterest !== undefined) {
            doc.text(`Total con interés: ${formatMoney(totalWithInterest)}`, 14, y);
            y += 6;
        }
        if (remainingBalance !== undefined) {
            doc.text(`Saldo restante: ${formatMoney(remainingBalance)}`, 14, y);
            y += 6;
        }
    }
    y += 4;

    // Footer
    doc.line(14, y, 196, y);
    y += 6;
    doc.setFontSize(8);
    doc.text(`Generado: ${new Date().toLocaleString('es-CO')}`, 14, y);
    doc.text('GestiónCrediFácil', 105, y, { align: 'center' });

    return y;
}

/**
 * Genera y descarga un PDF con un solo recibo.
 */
export function generateReceipt(payment: Payment) {
    const credit = payment.credit;
    const clientName = credit?.client?.fullName || 'Cliente';
    const creditId = payment.creditId;
    const capital = credit ? Number(credit.amount) : undefined;
    const totalWithInterest = credit ? Number(credit.totalWithInterest) : undefined;
    const remainingBalance = Number(payment.remainingBalanceAfter);

    const doc = new jsPDF();
    drawReceipt(doc, { payment, clientName, creditId, capital, totalWithInterest, remainingBalance });

    const dateStr = new Date(payment.paymentDate).toLocaleDateString('es-CO').replace(/\//g, '-');
    const amountStr = String(Math.ceil(Number(payment.amount)));
    doc.save(`recibo-${clientName.replace(/\s+/g, '_')}-${dateStr}-${amountStr}.pdf`);
}

/**
 * Genera y descarga un PDF con varios recibos (uno por página).
 */
export function generateBatchReceipts(payments: Payment[]) {
    if (payments.length === 0) {
        alert('Selecciona al menos un pago');
        return;
    }

    const doc = new jsPDF();
    payments.forEach((p, idx) => {
        if (idx > 0) doc.addPage();
        const credit = p.credit;
        const clientName = credit?.client?.fullName || 'Cliente';
        const capital = credit ? Number(credit.amount) : undefined;
        const totalWithInterest = credit ? Number(credit.totalWithInterest) : undefined;
        const remainingBalance = Number(p.remainingBalanceAfter);
        drawReceipt(doc, {
            payment: p,
            clientName,
            creditId: p.creditId,
            capital,
            totalWithInterest,
            remainingBalance,
        });
    });

    const today = new Date().toLocaleDateString('es-CO').replace(/\//g, '-');
    doc.save(`recibos-${today}-${payments.length}items.pdf`);
}
