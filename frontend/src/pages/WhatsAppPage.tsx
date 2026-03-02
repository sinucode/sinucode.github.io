import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../store/authStore';
import { getBusinesses } from '../api/business.api';
import {
    getWhatsAppStatus,
    saveWhatsAppTemplate,
    sendTestMessage,
    logoutWhatsApp
} from '../api/whatsapp.api';
import { Bot, CheckCircle, Copy, LogOut, MessageCircle, AlertTriangle, PlayCircle } from 'lucide-react';

export default function WhatsAppPage() {
    const queryClient = useQueryClient();
    const currentUser = useAuthStore((state) => state.user);
    const [selectedBusiness, setSelectedBusiness] = useState<string>('');
    const [template, setTemplate] = useState<string>('');
    const [testPhone, setTestPhone] = useState<string>('');

    // Fetch businesses depending on role
    const { data: businesses, isLoading: isLoadingBusinesses } = useQuery({
        queryKey: ['businesses'],
        queryFn: getBusinesses,
    });

    // Auto-select business
    useEffect(() => {
        if (businesses && businesses.length > 0 && !selectedBusiness) {
            setSelectedBusiness(businesses[0].id);
            if ((businesses[0] as any).whatsappMessageTemplate) {
                setTemplate((businesses[0] as any).whatsappMessageTemplate);
            }
        }
    }, [businesses, selectedBusiness]);

    // Update template when business changes
    const handleBusinessChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const id = e.target.value;
        setSelectedBusiness(id);
        const biz = businesses?.find(b => b.id === id);
        if (biz && (biz as any).whatsappMessageTemplate) {
            setTemplate((biz as any).whatsappMessageTemplate);
        } else {
            setTemplate('');
        }
    };

    // Polling WhatsApp Status every 5 seconds
    const { data: wpStatus, isLoading: isLoadingStatus } = useQuery({
        queryKey: ['whatsappStatus'],
        queryFn: getWhatsAppStatus,
        refetchInterval: 5000,
    });

    // Mutations
    const saveTemplateMutation = useMutation({
        mutationFn: () => saveWhatsAppTemplate(selectedBusiness, template),
        onSuccess: (data) => {
            alert(data.message);
            queryClient.invalidateQueries({ queryKey: ['businesses'] });
        },
        onError: (error: any) => {
            alert(error.response?.data?.error || 'Error guardando plantilla');
        }
    });

    const testMessageMutation = useMutation({
        mutationFn: () => sendTestMessage(testPhone, template, selectedBusiness),
        onSuccess: (data) => {
            alert(data.message);
        },
        onError: (error: any) => {
            alert(error.response?.data?.error || 'Error enviando mensaje');
        }
    });

    const logoutMutation = useMutation({
        mutationFn: logoutWhatsApp,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['whatsappStatus'] });
        }
    });

    const insertVariable = (variable: string) => {
        setTemplate((prev) => prev + ` {{${variable}}}`);
    };

    if (isLoadingBusinesses || isLoadingStatus) {
        return (
            <div className="flex justify-center items-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
            </div>
        );
    }

    if (currentUser?.role !== 'super_admin' && currentUser?.role !== 'admin') {
        return (
            <div className="container mx-auto px-4 py-8">
                <div className="bg-red-50 text-red-600 p-4 rounded-lg flex items-center gap-2">
                    <AlertTriangle /> No tienes permisos para configurar el Bot de WhatsApp.
                </div>
            </div>
        );
    }

    const { status, qrCode, number } = wpStatus || { status: 'DISCONNECTED', qrCode: null, number: null };

    return (
        <div className="container mx-auto px-4 py-8 max-w-6xl">
            <div className="flex items-center gap-3 mb-8 text-primary-900 border-b pb-4">
                <Bot size={32} />
                <h1 className="text-2xl font-bold">Configuración: Bot y Mensajes de WhatsApp</h1>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

                {/* Left Panel: Bot Connection Status */}
                <div className="col-span-1 lg:col-span-4 flex flex-col gap-6">
                    <div className="bg-white rounded-lg shadow p-6 flex flex-col items-center">
                        <h2 className="text-lg font-semibold mb-4 w-full flex items-center gap-2">
                            Estado de Conexión
                        </h2>

                        {status === 'CONNECTED' ? (
                            <div className="flex flex-col items-center text-center space-y-4">
                                <div className="p-4 bg-green-50 rounded-full text-green-600 mb-2">
                                    <CheckCircle size={48} />
                                </div>
                                <h3 className="font-bold text-lg text-gray-800">Conectado Exitosamente</h3>
                                <p className="text-gray-600">Número vinculado: <span className="font-medium text-primary-700">{number}</span></p>

                                <button
                                    onClick={() => logoutMutation.mutate()}
                                    disabled={logoutMutation.isPending}
                                    className="mt-4 px-4 py-2 bg-red-50 text-red-600 rounded-md hover:bg-red-100 flex items-center gap-2 transition-colors w-full justify-center disabled:opacity-50"
                                >
                                    <LogOut size={18} /> Cerrar Sesión
                                </button>
                                <p className="text-xs text-gray-400 mt-2 text-justify">
                                    El bot enviará recordatorios automáticamente a las 12:00 PM para cada negocio configurado.
                                    La conexión permanecerá activa en el servidor.
                                </p>
                            </div>
                        ) : status === 'CONNECTING' ? (
                            <div className="flex flex-col items-center py-8">
                                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mb-4"></div>
                                <p className="text-gray-600">Inicializando cliente de WhatsApp...</p>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center text-center space-y-4 w-full">
                                {qrCode ? (
                                    <>
                                        <p className="text-sm text-gray-600 mb-2 font-medium bg-amber-50 p-3 rounded border border-amber-200 w-full">
                                            Abre WhatsApp en tu dispositivo, ve a Dispositivos Vinculados y escanea el código.
                                        </p>
                                        <div className="bg-gray-50 border p-2 rounded-lg inline-flex">
                                            <img src={qrCode} alt="WhatsApp QR Code" className="w-64 h-64 mx-auto object-contain" />
                                        </div>
                                    </>
                                ) : (
                                    <div className="py-12 flex flex-col items-center">
                                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-400 mb-4"></div>
                                        <p className="text-gray-600">Generando nuevo código QR...</p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Right Panel: Template and Tests */}
                <div className="col-span-1 lg:col-span-8 flex flex-col gap-6">

                    {/* Template Configuration */}
                    <div className="bg-white rounded-lg shadow p-6">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-lg font-semibold flex items-center gap-2">
                                <MessageCircle size={20} className="text-primary-600" />
                                Plantilla de Recordatorios
                            </h2>
                            <div className="w-64 hidden sm:block">
                                <select
                                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 bg-gray-50 p-2 border"
                                    value={selectedBusiness}
                                    onChange={handleBusinessChange}
                                >
                                    <option value="" disabled>Seleccionar Negocio...</option>
                                    {businesses?.map(b => (
                                        <option key={b.id} value={b.id}>{b.name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* Mobile select fallback */}
                        <div className="sm:hidden mb-4">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Negocio:</label>
                            <select
                                className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 bg-gray-50 p-2 border"
                                value={selectedBusiness}
                                onChange={handleBusinessChange}
                            >
                                <option value="" disabled>Seleccionar Negocio...</option>
                                {businesses?.map(b => (
                                    <option key={b.id} value={b.id}>{b.name}</option>
                                ))}
                            </select>
                        </div>

                        <div className="mb-4 bg-primary-50 border border-primary-200 rounded-lg p-4 text-sm text-primary-800">
                            <strong>Variables Dinámicas:</strong> Haz clic para insertar estas variables en tu mensaje. El sistema las reemplazará antes de enviar.
                            <div className="flex flex-wrap gap-2 mt-3">
                                {['cliente', 'monto', 'fecha', 'negocio'].map(variable => (
                                    <button
                                        key={variable}
                                        onClick={() => insertVariable(variable)}
                                        className="bg-white border border-primary-300 px-3 py-1.5 rounded-full text-primary-700 font-medium hover:bg-primary-100 transition-colors flex items-center gap-1 shadow-sm"
                                    >
                                        <Copy size={14} className="opacity-70" /> {'{{'}{variable}{'}}'}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="mb-6">
                            <label className="block text-sm font-medium text-gray-700 mb-2">Mensaje del Recordatorio:</label>
                            <textarea
                                value={template}
                                onChange={(e) => setTemplate(e.target.value)}
                                className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 min-h-[160px] p-3 border resize-y"
                                placeholder="Hola {{cliente}}, te recordamos que tu cuota de {{monto}} para el negocio {{negocio}} vence el {{fecha}}."
                                disabled={!selectedBusiness}
                            />
                        </div>

                        <div className="flex justify-end">
                            <button
                                onClick={() => saveTemplateMutation.mutate()}
                                disabled={!selectedBusiness || saveTemplateMutation.isPending}
                                className="bg-primary-600 text-white px-6 py-2 rounded shadow hover:bg-primary-700 transition disabled:opacity-50 flex items-center gap-2"
                            >
                                Guardar Plantilla
                            </button>
                        </div>
                    </div>

                    {/* Test Block */}
                    <div className="bg-white rounded-lg shadow p-6 border-l-4 border-amber-400">
                        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-gray-800">
                            <PlayCircle className="text-amber-500" />
                            Enviar Prueba en Vivo
                        </h2>
                        <p className="text-sm text-gray-600 mb-6">
                            Verifica cómo se verá el mensaje enviando una prueba a tu propio número antes de que el bot lo envié a los clientes.
                            El sistema usará datos aleatorios para llenar las variables.
                        </p>

                        <div className="flex flex-col sm:flex-row gap-4 items-end">
                            <div className="flex-1 w-full">
                                <label className="block text-sm font-medium text-gray-700 mb-1">Número Destino:</label>
                                <div className="flex">
                                    <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-gray-300 bg-gray-50 text-gray-500 sm:text-sm">
                                        +57
                                    </span>
                                    <input
                                        type="tel"
                                        className="flex-1 min-w-0 block w-full px-3 py-2 rounded-none rounded-r-md sm:text-sm border border-gray-300 focus:ring-primary-500 focus:border-primary-500"
                                        placeholder="3001234567"
                                        value={testPhone}
                                        onChange={(e) => setTestPhone(e.target.value)}
                                    />
                                </div>
                            </div>
                            <button
                                onClick={() => testMessageMutation.mutate()}
                                disabled={!testPhone || !template || testMessageMutation.isPending || status !== 'CONNECTED'}
                                className="w-full sm:w-auto bg-gray-800 text-white px-6 py-2 rounded shadow hover:bg-gray-900 transition disabled:opacity-50 h-[38px] flex items-center justify-center gap-2"
                            >
                                Enviar de Prueba
                            </button>
                        </div>
                        {status !== 'CONNECTED' && (
                            <p className="text-xs text-red-500 mt-2 font-medium">El bot de WhatsApp debe estar conectado para poder enviar pruebas.</p>
                        )}
                    </div>

                </div>
            </div>
        </div>
    );
}

