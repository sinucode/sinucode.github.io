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
 * Calcula el plan de pagos para un crédito
 * @param amount - Monto del préstamo
 * @param interestRate - Tasa de interés mensual (ej: 10 para 10%)
 * @param startDate - Fecha de inicio del crédito
 * @param termDays - Plazo en días
 * @param frequency - Frecuencia de pago (daily, weekly, biweekly, monthly)
 * @returns Calculation con plan de pagos completo
 */
export const calculateCreditPlan = (
    amount: number,
    interestRate: number,
    startDate: Date,
    termDays: number,
    frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly'
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
        case 'biweekly':
            daysBetweenPayments = 15;
            numberOfPayments = Math.ceil(termDays / 15);
            break;
        case 'monthly':
            daysBetweenPayments = 30;
            numberOfPayments = Math.ceil(termDays / 30);
            break;
    }

    // Calcular interés total basado en el número de cuotas
    // La tasa de interés es MENSUAL, pero se prorratea por cuota
    // Regla de negocio:
    //   - 10% mensual con 4 cuotas semanales = 2.5% por semana (10% / 4)
    //   - 2 semanas al 10% mensual = 2 × 2.5% = 5% total = $50,000 en $1M
    //   - 3 semanas al 10% mensual = 3 × 2.5% = 7.5% total = $75,000 en $1M
    //   - 4 semanas al 10% mensual = 4 × 2.5% = 10% total = $100,000 en $1M
    const rateDecimal = interestRate / 100;

    // Calcular el interés por cuota según la frecuencia
    // 1 mes = 4 semanas, 2 quincenas, o 1 mensualidad
    let paymentsPerMonth = 1;
    if (frequency === 'weekly') paymentsPerMonth = 4;
    else if (frequency === 'biweekly') paymentsPerMonth = 2;
    else if (frequency === 'daily') paymentsPerMonth = 30;

    const interestPerPayment = rateDecimal / paymentsPerMonth;
    const totalInterest = amount * interestPerPayment * numberOfPayments;
    const totalWithInterest = amount + totalInterest;

    // Calcular monto de cada cuota (distribuido equitativamente)
    const paymentAmount = totalWithInterest / numberOfPayments;

    // Generar plan de pagos
    const paymentPlan: PaymentPlan[] = [];
    const start = new Date(startDate);

    for (let i = 0; i < numberOfPayments; i++) {
        const dueDate = new Date(start);
        dueDate.setDate(start.getDate() + daysBetweenPayments * (i + 1));

        paymentPlan.push({
            installmentNumber: i + 1,
            dueDate,
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
    return endDate;
};

/**
 * Distribuye un pago entre capital e intereses
 * @param paymentAmount - Monto del pago
 * @param remainingBalance - Saldo pendiente total
 * @param originalAmount - Monto original del préstamo
 * @param totalInterest - Interés total del crédito
 * @returns Distribución del pago
 */
export const distributePayment = (
    paymentAmount: number,
    remainingBalance: number,
    originalAmount: number,
    totalInterest: number
) => {
    const totalAmount = originalAmount + totalInterest;
    const paidSoFar = totalAmount - remainingBalance;

    // Calcular cuánto del interés ya se ha pagado
    const interestProportion = totalInterest / totalAmount;
    const interestPaidSoFar = paidSoFar * interestProportion;
    const remainingInterest = totalInterest - interestPaidSoFar;

    // Distribuir el pago proporcionalmente
    const amountToInterest = Math.min(
        paymentAmount * interestProportion,
        remainingInterest
    );
    const amountToPrincipal = paymentAmount - amountToInterest;

    return {
        amountToPrincipal,
        amountToInterest,
        newBalance: remainingBalance - paymentAmount,
    };
};
