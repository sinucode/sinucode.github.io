import { normalizeToNoon } from './dates';

/**
 * Cálculos de intereses y plan de pagos para créditos
 */

export interface PaymentPlan {
    installmentNumber: number;
    dueDate: Date;
    scheduledAmount: number;
}

export interface CreditCalculation {
    totalInterest: number;
    totalWithInterest: number;
    numberOfPayments: number;
    paymentAmount: number;
    paymentPlan: PaymentPlan[];
}

/**
 * Función auxiliar para obtener la siguiente fecha quincenal (15 o 30 de cada mes)
 */
const getNextQuincena = (currentDate: Date): Date => {
    const d = new Date(currentDate);
    const day = d.getDate();
    const month = d.getMonth();
    const year = d.getFullYear();

    if (day < 15) {
        d.setDate(15);
    } else if (day >= 15 && day < 30) {
        // Si es febrero o el mes no tiene día 30, caerá al último del mes (ej: 28 de feb)
        const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
        d.setDate(Math.min(30, lastDayOfMonth));
    } else {
        // Día 30 o 31 -> 15 del siguiente mes
        d.setMonth(month + 1);
        d.setDate(15);
    }
    return normalizeToNoon(d);
};

/**
 * Calcula el plan de pagos para un crédito
 * @param amount - Monto del préstamo
 * @param interestRate - Tasa de interés mensual (ej: 10 para 10%)
 * @param startDate - Fecha de inicio del crédito
 * @param termDays - Plazo en días
 * @param frequency - Frecuencia de pago (daily, weekly, bisemanal, quincenal, monthly)
 * @returns Calculation con plan de pagos completo
 */
export const calculateCreditPlan = (
    amount: number,
    interestRate: number,
    startDate: Date,
    termDays: number,
    frequency: 'daily' | 'weekly' | 'bisemanal' | 'quincenal' | 'monthly'
): CreditCalculation => {
    // Calcular número de cuotas según frecuencia
    let numberOfPayments = 0;
    let daysBetweenPayments = 0;

    switch (frequency) {
        case 'daily':
            daysBetweenPayments = 1;
            numberOfPayments = termDays;
            break;
        case 'weekly':
            daysBetweenPayments = 7;
            numberOfPayments = Math.ceil(termDays / 7);
            break;
        case 'bisemanal':
            daysBetweenPayments = 14;
            numberOfPayments = Math.ceil(termDays / 14);
            break;
        case 'quincenal':
            daysBetweenPayments = 15; // Promedio para cálculo de número de cuotas
            numberOfPayments = Math.ceil(termDays / 15);
            break;
        case 'monthly':
            daysBetweenPayments = 30;
            numberOfPayments = Math.ceil(termDays / 30);
            break;
    }

    // Calcular interés total basado en el número de cuotas
    const rateDecimal = interestRate / 100;

    // Calcular el interés por cuota según la frecuencia
    // 1 mes = 4 semanas, 2 quincenas (bisemanal o quincenal), o 1 mensualidad
    let paymentsPerMonth = 1;
    if (frequency === 'weekly') paymentsPerMonth = 4;
    else if (frequency === 'bisemanal' || frequency === 'quincenal') paymentsPerMonth = 2;
    else if (frequency === 'daily') paymentsPerMonth = 30;

    const interestPerPayment = rateDecimal / paymentsPerMonth;
    const totalInterest = amount * interestPerPayment * numberOfPayments;
    const totalWithInterest = amount + totalInterest;

    // Calcular monto de cada cuota (distribuido equitativamente)
    const paymentAmount = totalWithInterest / numberOfPayments;

    // Generar plan de pagos
    const paymentPlan: PaymentPlan[] = [];
    let currentDueDate = normalizeToNoon(startDate);

    for (let i = 0; i < numberOfPayments; i++) {
        if (frequency === 'quincenal') {
            currentDueDate = getNextQuincena(currentDueDate);
        } else {
            const nextDate = new Date(currentDueDate);
            nextDate.setDate(currentDueDate.getDate() + daysBetweenPayments);
            currentDueDate = normalizeToNoon(nextDate);
        }

        paymentPlan.push({
            installmentNumber: i + 1,
            dueDate: currentDueDate,
            scheduledAmount: paymentAmount,
        });
    }

    return {
        totalInterest,
        totalWithInterest,
        numberOfPayments,
        paymentAmount,
        paymentPlan,
    };
};

/**
 * Calcula la fecha de finalización del crédito
 */
export const calculateEndDate = (startDate: Date, termDays: number): Date => {
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + termDays);
    return normalizeToNoon(endDate);
};
