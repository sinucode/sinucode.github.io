/**
 * Utilidades de fecha con normalización para evitar desfases de zona horaria.
 */

/**
 * Normaliza una fecha al mediodía (12:00 PM) de Colombia (UTC-5).
 * Si recibe un string YYYY-MM-DD, le concatena la zona horaria antes de crear el objeto Date.
 */
export const normalizeToNoon = (date?: string | Date | null): Date => {
    if (!date) {
        const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
        return new Date(`${todayStr}T12:00:00.000-05:00`);
    }

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

/**
 * Inicio del día en Bogotá (UTC-5) para rangos de filtro.
 * Si recibe "YYYY-MM-DD" lo ancla a las 00:00:00.000-05:00 (evita que new Date() lo lea como
 * UTC y recorte ~5h del día). Si ya trae tiempo/zona, lo parsea tal cual.
 */
export const bogotaStartOfDay = (date: string | Date): Date => {
    if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return new Date(`${date}T00:00:00.000-05:00`);
    }
    return new Date(date);
};

/**
 * Fin del día en Bogotá (UTC-5) para rangos de filtro.
 * Si recibe "YYYY-MM-DD" lo ancla a las 23:59:59.999-05:00. Si ya trae tiempo/zona, lo parsea tal cual.
 */
export const bogotaEndOfDay = (date: string | Date): Date => {
    if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return new Date(`${date}T23:59:59.999-05:00`);
    }
    return new Date(date);
};
