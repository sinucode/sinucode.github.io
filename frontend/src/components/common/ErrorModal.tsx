import { useEffect, useRef } from 'react';

interface ErrorModalProps {
    code: string;
    message: string;
    details?: unknown;
    onClose: () => void;
}

export function ErrorModal({ code, message, details, onClose }: ErrorModalProps) {
    const btnRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        btnRef.current?.focus();
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);

    const renderDetails = () => {
        if (!details) return null;
        if (typeof details === 'object' && details !== null) {
            return Object.entries(details as Record<string, unknown>).map(([k, v]) => (
                <div key={k} className="text-xs text-gray-600">
                    <span className="font-medium">{k}:</span> {String(v)}
                </div>
            ));
        }
        return <div className="text-xs text-gray-600">{String(details)}</div>;
    };

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
            {/* Overlay oscuro */}
            <div className="absolute inset-0 bg-black/60" />

            {/* Modal */}
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
                {/* Cabecera roja */}
                <div className="bg-red-600 px-5 py-4 flex items-center gap-3">
                    <div className="flex-shrink-0 w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
                        <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                        </svg>
                    </div>
                    <div>
                        <p className="text-white font-bold text-base leading-tight">Error del sistema</p>
                        <p className="text-red-100 text-xs font-mono mt-0.5">{code}</p>
                    </div>
                </div>

                {/* Cuerpo */}
                <div className="px-5 py-4 space-y-3">
                    <p className="text-gray-800 text-sm leading-relaxed">{message}</p>

                    {!!details && (
                        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-1">
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Detalles</p>
                            {renderDetails()}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-5 pb-5 flex justify-end">
                    <button
                        ref={btnRef}
                        onClick={onClose}
                        className="px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
                    >
                        Aceptar
                    </button>
                </div>
            </div>
        </div>
    );
}
