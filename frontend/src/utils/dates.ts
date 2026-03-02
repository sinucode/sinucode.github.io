/**
 * Utilidades de fecha para zona horaria Colombia (Bogotá/Lima/Quito — UTC-5)
 * Todas las fechas del sistema se muestran en esta zona horaria.
 */

const TIMEZONE = 'America/Bogota';

/**
 * Formatea una fecha en zona horaria Bogotá
 * Ejemplo: "15 mar 2025"
 */
export const formatDate = (date: string | Date | null | undefined): string => {
    if (!date) return '—';
    return new Date(date).toLocaleDateString('es-CO', {
        timeZone: TIMEZONE,
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    });
};

/**
 * Formatea fecha con hora en zona Bogotá
 * Ejemplo: "15 mar 2025, 10:30 a.m."
 */
export const formatDateTime = (date: string | Date | null | undefined): string => {
    if (!date) return '—';
    return new Date(date).toLocaleString('es-CO', {
        timeZone: TIMEZONE,
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
};

/**
 * Retorna la fecha actual en Bogotá como string YYYY-MM-DD
 * Útil para inicializar inputs de tipo date
 */
export const todayBogota = (): string => {
    return new Date().toLocaleDateString('en-CA', { timeZone: TIMEZONE }); // en-CA da formato YYYY-MM-DD
};

/**
 * Retorna el objeto Date representando "hoy" a medianoche en Bogotá
 */
export const startOfTodayBogota = (): Date => {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: TIMEZONE });
    return new Date(`${today}T00:00:00-05:00`);
};

/**
 * Determina si una fecha (cuota) está vencida respecto a hoy en Bogotá
 */
export const isOverdueBogota = (dueDate: string | Date): boolean => {
    const due = new Date(dueDate);
    const now = new Date();
    // Comparar en zona Bogotá
    const dueStr = due.toLocaleDateString('en-CA', { timeZone: TIMEZONE });
    const todayStr = now.toLocaleDateString('en-CA', { timeZone: TIMEZONE });
    return dueStr < todayStr;
};
