import { useNavigate } from 'react-router-dom';
import { ChevronRight, AlertCircle } from 'lucide-react';
import type { TopDeudor } from '../../api/dashboard.api';

const formatMoney = (val: number) => `$${Math.ceil(val).toLocaleString('es-CO')}`;

const formatRelativeDate = (iso: string | null): string => {
    if (!iso) return 'Sin pagos';
    const date = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (days === 0) return 'Hoy';
    if (days === 1) return 'Hace 1 día';
    if (days < 30) return `Hace ${days} días`;
    const months = Math.floor(days / 30);
    return months === 1 ? 'Hace 1 mes' : `Hace ${months} meses`;
};

interface TopDeudoresProps {
    deudores: TopDeudor[];
}

export default function TopDeudores({ deudores }: TopDeudoresProps) {
    const navigate = useNavigate();

    if (deudores.length === 0) {
        return (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 text-center">
                <p className="text-sm text-gray-500">No hay clientes con saldo pendiente</p>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-200 bg-gray-50">
                <h3 className="text-sm font-semibold text-gray-900">Top 10 clientes deudores</h3>
                <p className="text-xs text-gray-500 mt-0.5">Ordenados por saldo pendiente</p>
            </div>
            <div className="divide-y divide-gray-100">
                {deudores.map((d, idx) => (
                    <button
                        key={d.creditId}
                        onClick={() => navigate(`/credits/${d.creditId}`)}
                        className="w-full px-5 py-3 flex items-center gap-3 hover:bg-gray-50 transition text-left"
                    >
                        <div className="w-7 h-7 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center text-xs font-bold">
                            {idx + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-900 truncate">{d.fullName}</p>
                            <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500">
                                <span>Último pago: {formatRelativeDate(d.ultimaFechaPago)}</span>
                                {d.cuotasVencidas > 0 && (
                                    <span className="flex items-center gap-1 text-red-600 font-medium">
                                        <AlertCircle size={12} />
                                        {d.cuotasVencidas} cuota{d.cuotasVencidas > 1 ? 's' : ''} vencida{d.cuotasVencidas > 1 ? 's' : ''}
                                    </span>
                                )}
                            </div>
                        </div>
                        <div className="text-right">
                            <p className="text-sm font-bold text-gray-900">{formatMoney(d.saldo)}</p>
                        </div>
                        <ChevronRight size={16} className="text-gray-400" />
                    </button>
                ))}
            </div>
        </div>
    );
}
