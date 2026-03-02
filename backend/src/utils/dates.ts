/**
 * Utilidades de fecha con normalización para evitar desfases de zona horaria.
 */

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
