import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { PieChart as PieChartIcon } from 'lucide-react';

interface DistribucionCarteraProps {
    activos: number;
    vencidos: number;
    pagados: number;
}

const formatMoney = (val: number) => `$${Math.ceil(val).toLocaleString('es-CO')}`;

const COLORS = {
    activos: '#10b981',  // emerald-500
    vencidos: '#ef4444', // red-500
    pagados: '#6366f1',  // indigo-500
};

export default function DistribucionCartera({ activos, vencidos, pagados }: DistribucionCarteraProps) {
    const data = [
        { name: 'Activos', value: activos, color: COLORS.activos },
        { name: 'Vencidos', value: vencidos, color: COLORS.vencidos },
        { name: 'Pagados', value: pagados, color: COLORS.pagados },
    ].filter((d) => d.value > 0);

    const total = data.reduce((s, d) => s + d.value, 0);

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-200 bg-gray-50">
                <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                    <PieChartIcon size={16} />
                    Distribución de cartera
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">Total: {formatMoney(total)}</p>
            </div>
            <div className="p-4" style={{ height: 240 }}>
                {data.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-sm text-gray-500">
                        Sin datos
                    </div>
                ) : (
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={data}
                                cx="50%"
                                cy="50%"
                                innerRadius={45}
                                outerRadius={75}
                                paddingAngle={2}
                                dataKey="value"
                            >
                                {data.map((entry, idx) => (
                                    <Cell key={`cell-${idx}`} fill={entry.color} />
                                ))}
                            </Pie>
                            <Tooltip
                                formatter={(value: any, name: any) => [formatMoney(Number(value)), name]}
                                contentStyle={{ fontSize: 12 }}
                            />
                            <Legend
                                verticalAlign="bottom"
                                height={36}
                                iconType="circle"
                                wrapperStyle={{ fontSize: 12 }}
                            />
                        </PieChart>
                    </ResponsiveContainer>
                )}
            </div>
        </div>
    );
}
