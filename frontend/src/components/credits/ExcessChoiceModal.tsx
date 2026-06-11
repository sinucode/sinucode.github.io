import React from 'react';
import { AlertCircle } from 'lucide-react';

const formatMoney = (value: number) => Math.ceil(value).toLocaleString('es-CO');

export interface CuotaConExceso {
    id: string;
    installmentNumber: number;
    pending: number;
    pago: number;
    exceso: number;
}

interface ExcessChoiceModalProps {
    open: boolean;
    cuotasConExceso: CuotaConExceso[];
    /** true si existe al menos una cuota pendiente después de las que tienen exceso */
    tieneCuotaSiguiente: boolean;
    isSubmitting?: boolean;
    onChoose: (action: 'next_cuota' | 'donate') => void;
    onCancel: () => void;
}

/**
 * Modal reutilizable que aparece cuando un pago supera el monto pendiente de una cuota.
 * Ofrece dos opciones: abonar el excedente a la siguiente cuota o donarlo al negocio.
 * Usado tanto en PaymentModal (pagos directos) como en CreditForm (financiamiento cruzado).
 */
const ExcessChoiceModal: React.FC<ExcessChoiceModalProps> = ({
    open,
    cuotasConExceso,
    tieneCuotaSiguiente,
    isSubmitting = false,
    onChoose,
    onCancel,
}) => {
    if (!open) return null;

    const totalExceso = cuotasConExceso.reduce((s, c) => s + c.exceso, 0);

    return (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/70 p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-5">
                <div className="flex items-start gap-3 mb-4">
                    <AlertCircle className="text-amber-600 shrink-0 mt-0.5" size={22} />
                    <div>
                        <h3 className="text-lg font-bold text-gray-900">Pago supera la cuota</h3>
                        <p className="text-sm text-gray-600 mt-1">
                            El cliente está pagando más de lo programado en{' '}
                            {cuotasConExceso.length === 1 ? 'una cuota' : `${cuotasConExceso.length} cuotas`}.
                        </p>
                    </div>
                </div>

                <div className="bg-gray-50 rounded-xl p-3 mb-4 space-y-1 max-h-40 overflow-y-auto">
                    {cuotasConExceso.map((c) => (
                        <div key={c.id} className="flex justify-between text-xs text-gray-700">
                            <span>Cuota #{c.installmentNumber}</span>
                            <span className="font-semibold">
                                Paga ${formatMoney(c.pago)} (cuota: ${formatMoney(c.pending)}, excedente:{' '}
                                <span className="text-amber-700">${formatMoney(c.exceso)}</span>)
                            </span>
                        </div>
                    ))}
                    <div className="border-t border-gray-300 pt-1 mt-1 flex justify-between text-sm font-bold text-gray-900">
                        <span>Excedente total</span>
                        <span className="text-amber-700">${formatMoney(totalExceso)}</span>
                    </div>
                </div>

                <p className="text-sm font-semibold text-gray-800 mb-3">¿Qué deseas hacer con el excedente?</p>

                <div className="space-y-2">
                    {tieneCuotaSiguiente ? (
                        <button
                            type="button"
                            disabled={isSubmitting}
                            onClick={() => onChoose('next_cuota')}
                            className="w-full text-left p-3 border border-primary-200 bg-primary-50 hover:bg-primary-100 rounded-xl transition disabled:opacity-50"
                        >
                            <div className="font-semibold text-primary-900 text-sm">Abonar a la siguiente cuota</div>
                            <div className="text-xs text-primary-700 mt-0.5">
                                El excedente queda como abono parcial de la próxima cuota pendiente. Reduce el saldo total.
                            </div>
                        </button>
                    ) : (
                        <div className="w-full text-left p-3 border border-gray-200 bg-gray-50 rounded-xl">
                            <div className="font-semibold text-gray-500 text-sm">Abonar a la siguiente cuota</div>
                            <div className="text-xs text-gray-500 mt-0.5">
                                ⚠️ No hay cuotas siguientes en este crédito. Solo aplica donación.
                            </div>
                        </div>
                    )}

                    <button
                        type="button"
                        disabled={isSubmitting}
                        onClick={() => onChoose('donate')}
                        className="w-full text-left p-3 border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 rounded-xl transition disabled:opacity-50"
                    >
                        <div className="font-semibold text-emerald-900 text-sm">Donar al negocio (ganancia)</div>
                        <div className="text-xs text-emerald-700 mt-0.5">
                            El excedente se registra como ganancia del negocio. NO reduce el saldo del crédito.
                            El dinero aportado fondea el crédito nuevo completo.
                        </div>
                    </button>

                    <button
                        type="button"
                        disabled={isSubmitting}
                        onClick={onCancel}
                        className="w-full p-3 text-gray-600 hover:bg-gray-100 rounded-xl transition text-sm border border-gray-200"
                    >
                        Cancelar
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ExcessChoiceModal;
