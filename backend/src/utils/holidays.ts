/**
 * Festivos colombianos — cálculo algorítmico.
 * Portado desde frontend/src/components/dashboard/ColombianCalendar.tsx
 */

/** Serializa una Date usando componentes locales (no UTC) para evitar off-by-one */
function fmtLocal(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Devuelve la fecha del siguiente lunes (Ley Emiliani). Si ya es lunes, devuelve el mismo día. */
function nextMonday(date: Date): string {
    const d = new Date(date);
    const day = d.getDay();
    if (day === 1) return fmtLocal(d); // ya es lunes
    const diff = day === 0 ? 1 : 8 - day;
    d.setDate(d.getDate() + diff);
    return fmtLocal(d);
}

/** Cálculo algorítmico de la fecha de Pascua (algoritmo anónimo de Gregorian Easter) */
function getEaster(year: number): Date {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31) - 1;
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(year, month, day);
}

/** Devuelve los festivos colombianos del año dado como strings YYYY-MM-DD */
export function getColombianHolidays(year: number): string[] {
    const addDays = (d: Date, n: number): string => {
        const x = new Date(d);
        x.setDate(x.getDate() + n);
        return fmtLocal(x);
    };

    const fixed = [
        `${year}-01-01`, // Año Nuevo
        `${year}-05-01`, // Día del Trabajo
        `${year}-07-20`, // Independencia de Colombia
        `${year}-08-07`, // Batalla de Boyacá
        `${year}-12-08`, // Inmaculada Concepción
        `${year}-12-25`, // Navidad
    ];

    // Festivos trasladados al lunes (Ley Emiliani)
    const emiliani = [
        new Date(year, 0, 6),   // Reyes Magos
        new Date(year, 2, 19),  // San José
        new Date(year, 5, 29),  // San Pedro y San Pablo
        new Date(year, 7, 15),  // Asunción de la Virgen
        new Date(year, 9, 12),  // Día de la Raza
        new Date(year, 10, 1),  // Todos los Santos
        new Date(year, 10, 11), // Independencia de Cartagena
    ];
    const emilianiDates = emiliani.map(base => nextMonday(base));

    // Basados en Pascua
    const easter = getEaster(year);
    const easterBased = [
        addDays(easter, -3),                                    // Jueves Santo
        addDays(easter, -2),                                    // Viernes Santo
        nextMonday(new Date(addDays(easter, 43))),              // Ascensión del Señor
        nextMonday(new Date(addDays(easter, 64))),              // Corpus Christi
        nextMonday(new Date(addDays(easter, 71))),              // Sagrado Corazón
    ];

    return [...fixed, ...emilianiDates, ...easterBased].sort();
}

/** Devuelve un Set de strings YYYY-MM-DD con todos los festivos de los años dados */
export function getHolidaySet(years: number[]): Set<string> {
    const set = new Set<string>();
    for (const year of years) {
        for (const dateStr of getColombianHolidays(year)) {
            set.add(dateStr);
        }
    }
    return set;
}

/** Verifica si una Date cae en un festivo colombiano.
 *  Formatea la fecha usando componentes locales (Bogotá, UTC-5) para evitar off-by-one. */
export function isHoliday(date: Date, set: Set<string>): boolean {
    return set.has(fmtLocal(date));
}
