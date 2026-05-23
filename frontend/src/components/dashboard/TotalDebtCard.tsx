import { DollarSign, CheckCircle, AlertTriangle } from 'lucide-react';

interface TotalDebtCardProps {
    totalAdeudado: number;
    carteraAlDia: number;
    carteraVencida: number;
}

const formatMoney = (val: number) => `$${Math.ceil(val).toLocaleString('es-CO')}`;

export default function TotalDebtCard({ totalAdeudado, carteraAlDia, carteraVencida }: TotalDebtCardProps) {
    const pctVencida = totalAdeudado > 0 ? (carteraVencida / totalAdeudado) * 100 : 0;

    return (
        <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl shadow-lg p-6 text-white">
            <div className="flex items-start justify-between mb-4">
                <div>
                    <p className="text-sm font-medium text-slate-300 uppercase tracking-wide">Lo que te deben los clientes</p>
                    <h2 className="text-4xl font-bold mt-2">{formatMoney(totalAdeudado)}</h2>
                </div>
                <div className="bg-white/10 rounded-xl p-3">
                    <DollarSign size={28} />
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
                <div className="bg-emerald-500/20 border border-emerald-400/30 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-1">
                        <CheckCircle size={16} className="text-emerald-300" />
                        <span className="text-xs font-medium text-emerald-100">Cartera al día</span>
                    </div>
                    <p className="text-xl font-bold text-emerald-50">{formatMoney(carteraAlDia)}</p>
                </div>
                <div className="bg-red-500/20 border border-red-400/30 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-1">
                        <AlertTriangle size={16} className="text-red-300" />
                        <span className="text-xs font-medium text-red-100">Cartera vencida</span>
                    </div>
                    <p className="text-xl font-bold text-red-50">{formatMoney(carteraVencida)}</p>
                    {pctVencida > 0 && (
                        <p className="text-xs text-red-200 mt-1">{pctVencida.toFixed(1)}% del total</p>
                    )}
                </div>
            </div>
        </div>
    );
}
