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

/**
 * Convierte un string YYYY-MM-DD (de un <input type="date"> o API) a un objeto Date
 * con medianoche **local** en lugar de medianoche UTC.
 *
 * ⚠️ `new Date("2026-06-01")` es medianoche UTC — en Bogotá (UTC-5) queda a
 *    las 19:00 del día anterior, provocando off-by-one.
 *    Esta función evita ese problema construyendo la Date con componentes locales.
 */
export const parseLocalDate = (dateStr: string): Date => {
    if (!dateStr || dateStr.length < 10) return new Date();
    const [year, month, day] = dateStr.slice(0, 10).split('-').map(Number);
    return new Date(year, month - 1, day); // medianoche local
};

/**
 * Serializa un objeto Date a string YYYY-MM-DD usando componentes **locales**,
 * NO `.toISOString()` que usa UTC.
 *
 * ⚠️ `date.toISOString().slice(0, 10)` en zonas al este de UTC retorna el día
 *    anterior. Esta función es timezone-safe en cualquier zona horaria.
 *
 * Usar siempre que necesites YYYY-MM-DD para mostrar en un input o comparar fechas.
 */
export const toLocalDateString = (date: Date): string =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/**
 * Normaliza una fecha al mediodía (12:00 PM) de Colombia (UTC-5).
 * Si recibe un string YYYY-MM-DD, le concatena la zona horaria antes de crear el objeto Date.
 */
export const normalizeToNoon = (date?: string | Date | null): Date => {
    if (!date) return new Date();

    if (date instanceof Date) {
        const d = new Date(date);
        d.setHours(12, 0, 0, 0);
        return d;
    }

    // Si es un string tipo "2025-10-10"
    if (typeof date === 'string' && date.length === 10 && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return new Date(`${date}T12:00:00.000-05:00`);
    }

    // Si ya trae tiempo o es otro formato, forzamos mediodía tras parsear
    const d = new Date(date);
    d.setHours(12, 0, 0, 0);
    return d;
};
