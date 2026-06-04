import { normalizeToNoon } from './dates';
import { getHolidaySet, isHoliday } from './holidays';

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

/** Opciones opcionales para el plan de pagos */
export interface ScheduleOptions {
    excludedWeekdays?: number[];   // Date.getDay(): 0=Dom, 1=Lun, ..., 6=Sáb
    excludeHolidays?: boolean;
    customRounding?: boolean;
    precomputedHolidaySet?: Set<string>;
}

/**
 * Redondea una cuota hacia arriba al múltiplo "limpio" más cercano.
 * < $10.000 → múltiplo de $1.000; ≥ $10.000 → múltiplo de $10.000.
 */
export function roundUpInstallment(v: number): number {
    if (v < 10000) return Math.ceil(v / 1000) * 1000;
    return Math.ceil(v / 10000) * 10000;
}

/** Devuelve true si la fecha debe excluirse según las opciones */
function isExcludedDate(date: Date, opts: ScheduleOptions, holidaySet: Set<string>): boolean {
    if (opts.excludedWeekdays?.includes(date.getDay())) return true;
    if (opts.excludeHolidays && isHoliday(date, holidaySet)) return true;
    return false;
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
 * @param options - Opciones opcionales (excludedWeekdays, excludeHolidays, customRounding)
 * @returns Calculation con plan de pagos completo
 */
export const calculateCreditPlan = (
    amount: number,
    interestRate: number,
    startDate: Date,
    termDays: number,
    frequency: 'daily' | 'weekly' | 'bisemanal' | 'quincenal' | 'monthly',
    options: ScheduleOptions = {}
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
            numberOfPayments = Math.ceil((termDays / 30) * 4);
            break;
        case 'bisemanal':
            daysBetweenPayments = 14;
            numberOfPayments = Math.ceil((termDays / 30) * 2);
            break;
        case 'quincenal':
            daysBetweenPayments = 15; // Promedio para cálculo de número de cuotas
            numberOfPayments = Math.ceil((termDays / 30) * 2);
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

    // Redondear totales a pesos enteros (COP no usa centavos).
    // El residuo de redondeo se absorbe en la última cuota para que Σcuotas == totalWithInterest exacto.
    const totalWithInterest = Math.round(amount + amount * interestPerPayment * numberOfPayments);
    const totalInterest = totalWithInterest - amount;

    // ── Holiday set (solo cuando se necesita) ──────────────────────────────
    const hasExclusions = (options.excludedWeekdays?.length ?? 0) > 0 || !!options.excludeHolidays;
    const startYear = startDate.getFullYear();
    const endYear = startYear + Math.ceil(termDays / 365) + 1;
    const holidaySet = options.excludeHolidays
        ? (options.precomputedHolidaySet ?? getHolidaySet(Array.from({ length: endYear - startYear + 1 }, (_, i) => startYear + i)))
        : new Set<string>();

    // ── Generar fechas candidatas dentro de la ventana del plazo ───────────
    // Sin exclusiones: todas las fechas del plan pasan.
    // DIARIO con exclusiones: se descartan los días excluidos; el total se reparte en
    //   menos cuotas dentro del plazo (menos cuotas, cada una más alta).
    // SEMANAL/BISEMANAL/QUINCENAL/MENSUAL con exclusiones: corrimiento fijo por cuota;
    //   la fecha base (cadencia) nunca se arrastra, solo se mueve la cuota afectada.
    const isDaily = frequency === 'daily';
    const allowedDates: Date[] = [];
    let currentDueDate = normalizeToNoon(startDate);

    for (let i = 0; i < numberOfPayments; i++) {
        if (frequency === 'quincenal') {
            currentDueDate = getNextQuincena(currentDueDate);
        } else {
            const nextDate = new Date(currentDueDate);
            nextDate.setDate(currentDueDate.getDate() + daysBetweenPayments);
            currentDueDate = normalizeToNoon(nextDate);
        }

        if (!hasExclusions) {
            allowedDates.push(currentDueDate);
        } else if (isDaily) {
            // DIARIO: descartar los días excluidos; el total se reparte en menos cuotas
            if (!isExcludedDate(currentDueDate, options, holidaySet)) {
                allowedDates.push(currentDueDate);
            }
        } else {
            // SEMANAL / BISEMANAL / QUINCENAL / MENSUAL: corrimiento fijo por cuota
            // Solo se mueve la cuota afectada; la cadencia base (currentDueDate) nunca se arrastra
            let bumped = currentDueDate;
            let guard = 0;
            while (isExcludedDate(bumped, options, holidaySet)) {
                const n = new Date(bumped);
                n.setDate(bumped.getDate() + 1);
                bumped = normalizeToNoon(n);
                if (++guard > 14) throw new Error('NO_COLLECTION_DAYS');
            }
            allowedDates.push(bumped);
            // IMPORTANTE: NO actualizar currentDueDate con bumped → corrimiento fijo
        }
    }

    // ── Montos por cuota (distribuidos entre `slots` fechas permitidas) ────
    const slots = allowedDates.length;
    // Puede quedar 0 en el path diario si todos los días del plazo son excluidos
    if (slots === 0) throw new Error('NO_COLLECTION_DAYS');
    const baseInstallment = Math.round(totalWithInterest / slots);
    let amounts: number[];
    if (options.customRounding) {
        const rounded = roundUpInstallment(baseInstallment);
        const k = Math.floor(totalWithInterest / rounded);
        const remainder = totalWithInterest - k * rounded;
        if (k === 0) {
            amounts = [totalWithInterest];
        } else if (remainder > 0) {
            amounts = [...Array(k).fill(rounded), remainder];
        } else {
            amounts = Array(k).fill(rounded);
        }
    } else {
        // Cuotas iguales; la última absorbe el residuo de redondeo
        amounts = Array.from({ length: slots }, (_, i) =>
            i === slots - 1
                ? totalWithInterest - baseInstallment * (slots - 1)
                : baseInstallment
        );
    }
    const count = amounts.length;

    // ── Construir plan de pagos ────────────────────────────────────────────
    // Si customRounding produjo menos cuotas que slots, tomamos solo las primeras fechas
    const paymentPlan: PaymentPlan[] = allowedDates.slice(0, count).map((dueDate, i) => ({
        installmentNumber: i + 1,
        dueDate,
        scheduledAmount: amounts[i],
    }));

    return {
        totalInterest,
        totalWithInterest,
        numberOfPayments: count,
        paymentAmount: amounts[0],
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
