import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp } from 'lucide-react';
import type { TendenciaPunto } from '../../api/dashboard.api';

interface TendenciaPagosProps {
    data: TendenciaPunto[];
}

const formatMoney = (val: number) => `$${Math.ceil(val).toLocaleString('es-CO')}`;

const formatShortDate = (iso: string) => {
    // iso = "YYYY-MM-DD"
    const [, m, d] = iso.split('-');
    return `${d}/${m}`;
};

export default function TendenciaPagos({ data }: TendenciaPagosProps) {
    const total = data.reduce((s, p) => s + p.monto, 0);
    const diasConPagos = data.filter((p) => p.monto > 0).length;
    const promedio = diasConPagos > 0 ? total / diasConPagos : 0;

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
                <div>
                    <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                        <TrendingUp size={16} />
                        Tendencia de pagos
                    </h3>
                    <p className="text-xs text-gray-500 mt-0.5">Total recibido en el período: {formatMoney(total)}</p>
                </div>
                {diasConPagos > 0 && (
                    <div className="text-right">
                        <p className="text-xs text-gray-500">Promedio diario</p>
                        <p className="text-sm font-semibold text-gray-900">{formatMoney(promedio)}</p>
                    </div>
                )}
            </div>
            <div className="p-4" style={{ height: 240 }}>
                {data.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-sm text-gray-500">
                        No hay datos para mostrar
                    </div>
                ) : (
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                            <XAxis
                                dataKey="fecha"
                                tickFormatter={formatShortDate}
                                tick={{ fontSize: 10, fill: '#6b7280' }}
                                interval="preserveStartEnd"
                            />
                            <YAxis
                                tick={{ fontSize: 10, fill: '#6b7280' }}
                                tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                            />
                            <Tooltip
                                formatter={(value: any) => [formatMoney(Number(value)), 'Recibido']}
                                labelFormatter={(label) => `Fecha: ${label}`}
                                contentStyle={{ fontSize: 12 }}
                            />
                            <Bar dataKey="monto" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                )}
            </div>
        </div>
    );
}
