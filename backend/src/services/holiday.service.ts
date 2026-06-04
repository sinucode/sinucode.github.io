import prisma from '../config/database';
import { getHolidaySet } from '../utils/holidays';

interface NagerHoliday {
    date: string;
    localName: string;
    name: string;
}

/**
 * Sincroniza festivos de Colombia desde nager.date para los años dados.
 * Hace upsert por (date, country) — idempotente.
 * Retorna el número total de filas procesadas.
 */
export async function syncHolidays(years: number[]): Promise<number> {
    // Llamadas HTTP en paralelo para todos los años
    const results = await Promise.allSettled(
        years.map(async (year) => {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 10_000);
            try {
                const res = await fetch(
                    `https://date.nager.at/api/v3/PublicHolidays/${year}/CO`,
                    { signal: controller.signal }
                );
                if (!res.ok) throw new Error(`nager.date HTTP ${res.status} para año ${year}`);
                const holidays = await res.json() as NagerHoliday[];
                // Validación mínima de la respuesta
                if (!Array.isArray(holidays) || holidays.length === 0) {
                    console.warn(`[holidays] Respuesta vacía o inválida de nager.date para año ${year}`);
                    return 0;
                }
                // Validar campos básicos
                const valid = holidays.filter(h =>
                    typeof h.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(h.date) &&
                    typeof h.localName === 'string' && h.localName.length > 0
                );
                await prisma.$transaction(
                    valid.map(h =>
                        prisma.publicHoliday.upsert({
                            where: { date_country: { date: h.date, country: 'CO' } },
                            update: { name: h.localName, year, syncedAt: new Date() },
                            create: { date: h.date, name: h.localName, year, country: 'CO' },
                        })
                    )
                );
                return valid.length;
            } finally {
                clearTimeout(timeout);
            }
        })
    );

    let total = 0;
    for (const result of results) {
        if (result.status === 'fulfilled') {
            total += result.value;
        } else {
            console.error('[holidays] Error sincronizando año:', result.reason);
        }
    }
    return total;
}

/**
 * Devuelve los festivos de los años dados desde la DB.
 * Si no hay filas para algún año, retorna vacío — el caller usa el algoritmo como fallback.
 */
export async function getHolidayDatesFromDB(years: number[]): Promise<Set<string>> {
    const rows = await prisma.publicHoliday.findMany({
        where: { year: { in: years }, country: 'CO' },
        select: { date: true },
    });
    return new Set(rows.map(r => r.date));
}

/**
 * Retorna festivos de DB si existen, o del algoritmo si la DB está vacía para esos años.
 */
export async function getHolidaySetWithFallback(years: number[]): Promise<Set<string>> {
    const dbSet = await getHolidayDatesFromDB(years);
    if (dbSet.size > 0) return dbSet;
    return getHolidaySet(years);
}
