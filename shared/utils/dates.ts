/**
 * Utilidades de fecha compartidas para evitar duplicación de código.
 */

const TIMEZONE = 'America/Bogota';

/**
 * Parsea una fecha asegurando que si viene en formato YYYY-MM-DD 
 * se interprete como el inicio del día local, evitando desfases UTC.
 */
export const parseISO = (date?: string | Date | null): Date => {
    if (!date) return new Date();
    if (date instanceof Date) return date;

    // Si es un string simple YYYY-MM-DD
    if (typeof date === 'string' && date.length === 10 && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
        const [year, month, day] = date.split('-').map(Number);
        return new Date(year, month - 1, day);
    }

    return new Date(date);
};

/**
 * Formatea una fecha para mostrar al usuario.
 */
export const formatDate = (date: string | Date | null | undefined): string => {
    if (!date) return '—';
    const d = parseISO(date);
    return d.toLocaleDateString('es-CO', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    });
};

/**
 * Formatea fecha con hora.
 */
export const formatDateTime = (date: string | Date | null | undefined): string => {
    if (!date) return '—';
    const d = parseISO(date);
    return d.toLocaleString('es-CO', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
};

/**
 * Retorna hoy como string YYYY-MM-DD en la zona horaria configurada.
 */
export const todayBogota = (): string => {
    return new Date().toLocaleDateString('en-CA', { timeZone: TIMEZONE });
};

/**
 * Determina si una fecha (cuota) está vencida respecto a hoy.
 */
export const isOverdueBogota = (dueDate: string | Date): boolean => {
    const due = parseISO(dueDate);
    const today = parseISO(todayBogota());
    return due < today;
};
