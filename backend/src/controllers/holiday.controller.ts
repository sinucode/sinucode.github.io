import { Request, Response } from 'express';
import { syncHolidays, getHolidaySetWithFallback } from '../services/holiday.service';

export const syncHolidaysController = async (_req: Request, res: Response) => {
    try {
        const currentYear = new Date().getFullYear();
        const years = [currentYear, currentYear + 1, currentYear + 2];
        const synced = await syncHolidays(years);
        return res.json({ synced, years });
    } catch (error: any) {
        console.error('Error sincronizando festivos:', error);
        return res.status(500).json({ error: error.message || 'Error al sincronizar festivos' });
    }
};

export const getHolidaysController = async (req: Request, res: Response) => {
    try {
        const yearsParam = req.query.years as string | undefined;
        const currentYear = new Date().getFullYear();
        const MAX_YEARS = 10;

        const years = yearsParam
            ? yearsParam
                .split(',')
                .slice(0, MAX_YEARS)
                .map(Number)
                .filter(n => Number.isInteger(n) && n >= 2000 && n <= currentYear + 5)
            : [currentYear];

        if (years.length === 0) {
            return res.status(400).json({ error: 'Parámetro years inválido' });
        }

        const set = await getHolidaySetWithFallback(years);
        return res.json({ dates: Array.from(set).sort() });
    } catch (error: any) {
        console.error('Error obteniendo festivos:', error);
        return res.status(500).json({ error: error.message || 'Error al obtener festivos' });
    }
};
