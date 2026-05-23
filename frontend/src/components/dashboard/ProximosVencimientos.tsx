import { Clock } from 'lucide-react';
import type { ProximoVencimiento } from '../../api/dashboard.api';

interface ProximosVencimientosProps {
    vencimientos: ProximoVencimiento[];
}

const formatMoney = (val: number) => `$${Math.ceil(val).toLocaleString('es-CO')}`;

const formatDate = (iso: string): { label: string; sub: string } => {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
    const [yy, mm, dd] = iso.split('-').map((s) => parseInt(s, 10));
    const date = new Date(yy, mm - 1, dd);
    const [tyy, tmm, tdd] = today.split('-').map((s) => parseInt(s, 10));
    const todayDate = new Date(tyy, tmm - 1, tdd);
    const diffDays = Math.round((date.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24));

    const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const monthNames = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    const dayName = dayNames[date.getDay()];
    const sub = `${dd} ${monthNames[mm - 1]}`;

    if (diffDays === 0) return { label: 'Hoy', sub };
    if (diffDays === 1) return { label: 'Mañana', sub };
    return { label: dayName, sub };
};

export default function ProximosVencimientos({ vencimientos }: ProximosVencimientosProps) {
    const total = vencimientos.reduce((s, v) => s + v.monto, 0);

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-200 bg-gray-50">
                <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                    <Clock size={16} />
                    Próximos 7 días
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">Por cobrar: {formatMoney(total)}</p>
            </div>
            <div className="divide-y divide-gray-100">
                {vencimientos.length === 0 ? (
                    <div className="px-5 py-6 text-center text-sm text-gray-500">
                        No hay cuotas pendientes en los próximos 7 días
                    </div>
                ) : (
                    vencimientos.map((v) => {
                        const { label, sub } = formatDate(v.fecha);
                        return (
                            <div key={v.fecha} className="px-5 py-2.5 flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-semibold text-gray-900">{label}</p>
                                    <p className="text-xs text-gray-500">{sub}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-sm font-bold text-gray-900">{formatMoney(v.monto)}</p>
                                    <p className="text-xs text-gray-500">{v.cantidad} cuota{v.cantidad > 1 ? 's' : ''}</p>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
