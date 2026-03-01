import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Calendar, AlertCircle, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface PaymentScheduleItem {
    id: string;
    dueDate: string;
    status: string;
    installmentNumber: number;
    scheduledAmount: number | string;
    paidAmount: number | string;
}

interface Credit {
    id: string;
    client?: { fullName: string };
    paymentSchedule?: PaymentScheduleItem[];
    status: string;
}

interface DuePayment {
    creditId: string;
    clientName: string;
    installmentNumber: number;
    amount: number;
    scheduleId: string;
    isOverdue: boolean;
}

interface ColombianCalendarProps {
    credits?: Credit[];
}


function nextMonday(date: Date): string {
    const d = new Date(date);
    const day = d.getDay();
    if (day === 1) return d.toISOString().slice(0, 10); // ya es lunes
    const diff = day === 0 ? 1 : 8 - day;
    d.setDate(d.getDate() + diff);
    return d.toISOString().slice(0, 10);
}

// Semana Santa: Jueves Santo y Viernes Santo (basado en fecha de Pascua)
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

function getColombianHolidays(year: number): { date: string; name: string }[] {
    const fixed = [
        { date: `${year}-01-01`, name: 'Año Nuevo' },
        { date: `${year}-05-01`, name: 'Día del Trabajo' },
        { date: `${year}-07-20`, name: 'Independencia de Colombia' },
        { date: `${year}-08-07`, name: 'Batalla de Boyacá' },
        { date: `${year}-12-08`, name: 'Inmaculada Concepción' },
        { date: `${year}-12-25`, name: 'Navidad' },
    ];

    // Festivos trasladados al lunes (Ley Emiliani)
    const emiliani = [
        { base: new Date(year, 0, 6), name: 'Reyes Magos' },
        { base: new Date(year, 2, 19), name: 'San José' },
        { base: new Date(year, 5, 29), name: 'San Pedro y San Pablo' },
        { base: new Date(year, 7, 15), name: 'Asunción de la Virgen' },
        { base: new Date(year, 9, 12), name: 'Día de la Raza' },
        { base: new Date(year, 10, 1), name: 'Todos los Santos' },
        { base: new Date(year, 10, 11), name: 'Independencia de Cartagena' },
    ];
    const emilianiDates = emiliani.map(({ base, name }) => ({ date: nextMonday(base), name }));

    // Basados en Pascua
    const easter = getEaster(year);
    const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
    const easterBased = [
        { date: addDays(easter, -3), name: 'Jueves Santo' },
        { date: addDays(easter, -2), name: 'Viernes Santo' },
        { date: nextMonday(new Date(addDays(easter, 43))), name: 'Ascensión del Señor' },
        { date: nextMonday(new Date(addDays(easter, 64))), name: 'Corpus Christi' },
        { date: nextMonday(new Date(addDays(easter, 71))), name: 'Sagrado Corazón' },
    ];

    return [...fixed, ...emilianiDates, ...easterBased].sort((a, b) => a.date.localeCompare(b.date));
}

const pad = (n: number) => String(n).padStart(2, '0');
const toKey = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

export default function ColombianCalendar({ credits = [] }: ColombianCalendarProps) {
    const navigate = useNavigate();
    const today = new Date();
    const [viewDate, setViewDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
    const [selectedDay, setSelectedDay] = useState<string | null>(today.toISOString().slice(0, 10));

    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();

    const holidays = useMemo(() => {
        const list = getColombianHolidays(year);
        const map: Record<string, string> = {};
        list.forEach(h => (map[h.date] = h.name));
        return map;
    }, [year]);

    // Mapa fecha → pagos debidos
    const dueMap = useMemo(() => {
        const map: Record<string, DuePayment[]> = {};
        credits.forEach((credit) => {
            if (!credit.paymentSchedule) return;
            credit.paymentSchedule.forEach((s) => {
                if (s.status === 'paid') return;
                const key = s.dueDate.slice(0, 10);
                if (!map[key]) map[key] = [];
                map[key].push({
                    creditId: credit.id,
                    clientName: credit.client?.fullName || 'Sin nombre',
                    installmentNumber: s.installmentNumber,
                    amount: Number(s.scheduledAmount) - Number(s.paidAmount || 0),
                    scheduleId: s.id,
                    isOverdue: new Date(s.dueDate) < today,
                });
            });
        });
        return map;
    }, [credits]);

    // Calcular días del mes
    const firstDayOfWeek = new Date(year, month, 1).getDay(); // 0=Dom
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const prevMonth = () => setViewDate(new Date(year, month - 1, 1));
    const nextMonth = () => setViewDate(new Date(year, month + 1, 1));

    const selectedPayments = selectedDay ? dueMap[selectedDay] || [] : [];
    const todayKey = today.toISOString().slice(0, 10);

    const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

    const formatMoney = (val: number) => `$${Math.ceil(val).toLocaleString('es-CO')}`;

    // Grid de celdas: padding inicial + días del mes
    const cells: (number | null)[] = [
        ...Array(firstDayOfWeek).fill(null),
        ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
    ];

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            {/* Header calendario */}
            <div className="bg-gradient-to-r from-primary-600 to-primary-700 text-white p-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Calendar size={18} />
                        <span className="font-semibold text-sm">Calendario de Pagos</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <button onClick={prevMonth} className="p-1 hover:bg-primary-500 rounded-md transition">
                            <ChevronLeft size={18} />
                        </button>
                        <span className="text-sm font-bold min-w-[120px] text-center">
                            {monthNames[month]} {year}
                        </span>
                        <button onClick={nextMonth} className="p-1 hover:bg-primary-500 rounded-md transition">
                            <ChevronRight size={18} />
                        </button>
                    </div>
                </div>
            </div>

            <div className="p-3">
                {/* Días de la semana */}
                <div className="grid grid-cols-7 mb-1">
                    {dayNames.map((d) => (
                        <div key={d} className="text-center text-xs font-semibold text-gray-400 py-1">{d}</div>
                    ))}
                </div>

                {/* Grid de días */}
                <div className="grid grid-cols-7 gap-0.5">
                    {cells.map((day, idx) => {
                        if (day === null) return <div key={`empty-${idx}`} />;
                        const key = toKey(year, month, day);
                        const isToday = key === todayKey;
                        const isSelected = key === selectedDay;
                        const holiday = holidays[key];
                        const payments = dueMap[key] || [];
                        const hasPayments = payments.length > 0;
                        const hasOverdue = payments.some(p => p.isOverdue);

                        return (
                            <button
                                key={key}
                                onClick={() => setSelectedDay(key)}
                                className={`relative p-1.5 rounded-lg text-xs text-center transition-all min-h-[42px] flex flex-col items-center gap-0.5
                                    ${isSelected ? 'bg-primary-600 text-white shadow-md' : ''}
                                    ${!isSelected && isToday ? 'bg-primary-100 text-primary-800 font-bold ring-2 ring-primary-400' : ''}
                                    ${!isSelected && !isToday && holiday ? 'text-red-500' : ''}
                                    ${!isSelected && !isToday && !holiday ? 'text-gray-700 hover:bg-primary-50' : ''}
                                `}
                            >
                                <span className="font-medium leading-none">{day}</span>
                                {hasPayments && (
                                    <span className={`w-5 h-4 rounded-full text-[10px] font-bold flex items-center justify-center leading-none
                                        ${isSelected ? 'bg-white text-primary-700' : hasOverdue ? 'bg-red-500 text-white' : 'bg-primary-500 text-white'}
                                    `}>
                                        {payments.length}
                                    </span>
                                )}
                                {holiday && !hasPayments && (
                                    <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white' : 'bg-red-400'}`} />
                                )}
                            </button>
                        );
                    })}
                </div>

                {/* Leyenda */}
                <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-100 text-xs text-gray-500">
                    <span className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded-full bg-primary-500 inline-block" />
                        Hoy
                    </span>
                    <span className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded-full bg-red-500 inline-block" />
                        Vencido
                    </span>
                    <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-red-400 inline-block" />
                        Festivo CO
                    </span>
                </div>
            </div>

            {/* Panel de detalle del día seleccionado */}
            {selectedDay && (
                <div className="border-t border-gray-100 bg-slate-50/60 p-4">
                    <div className="flex items-center justify-between mb-2">
                        <h4 className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
                            <Calendar size={14} className="text-primary-600" />
                            {new Date(selectedDay + 'T12:00:00').toLocaleDateString('es-CO', {
                                weekday: 'long', day: 'numeric', month: 'long',
                            })}
                        </h4>
                        {holidays[selectedDay] && (
                            <span className="text-xs text-red-500 font-medium bg-red-50 px-2 py-0.5 rounded-full border border-red-100">
                                🇨🇴 {holidays[selectedDay]}
                            </span>
                        )}
                    </div>

                    {selectedPayments.length === 0 ? (
                        <p className="text-sm text-gray-400 text-center py-3">Sin pagos pendientes este día</p>
                    ) : (
                        <div className="space-y-2 max-h-48 overflow-y-auto">
                            {selectedPayments.map((p) => (
                                <button
                                    key={p.scheduleId}
                                    onClick={() => navigate(`/credits/${p.creditId}`)}
                                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-all hover:shadow-sm
                                        ${p.isOverdue
                                            ? 'bg-red-50 border-red-200 hover:bg-red-100'
                                            : 'bg-white border-primary-100 hover:bg-primary-50'
                                        }`}
                                >
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0
                                        ${p.isOverdue ? 'bg-red-100' : 'bg-primary-100'}`}>
                                        <User size={14} className={p.isOverdue ? 'text-red-600' : 'text-primary-600'} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold text-gray-800 truncate">{p.clientName}</p>
                                        <p className="text-xs text-gray-500">Cuota #{p.installmentNumber}</p>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <p className={`text-sm font-bold ${p.isOverdue ? 'text-red-600' : 'text-primary-700'}`}>
                                            {formatMoney(p.amount)}
                                        </p>
                                        {p.isOverdue && (
                                            <span className="text-xs text-red-500 flex items-center gap-0.5 justify-end">
                                                <AlertCircle size={10} /> Vencida
                                            </span>
                                        )}
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
