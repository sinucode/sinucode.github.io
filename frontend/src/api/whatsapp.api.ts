import api from '../lib/axios';

export interface WhatsAppStatus {
    status: 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED';
    qrCode: string | null;
    number: string | null;
}

export interface SaveTemplateResponse {
    message: string;
    template: string;
}

export interface TestMessageResponse {
    message: string;
    formattedMessage: string;
}

/**
 * Obtener estado actual de WhatsApp y QR
 */
export const getWhatsAppStatus = async (): Promise<WhatsAppStatus> => {
    const response = await api.get<WhatsAppStatus>('/whatsapp/status');
    return response.data;
};

/**
 * Guardar plantilla de WhatsApp
 */
export const saveWhatsAppTemplate = async (
    businessId: string,
    template: string
): Promise<SaveTemplateResponse> => {
    const response = await api.put<SaveTemplateResponse>('/whatsapp/template', {
        businessId,
        template,
    });
    return response.data;
};

/**
 * Enviar mensaje de prueba
 */
export const sendTestMessage = async (
    phone: string,
    template: string,
    businessId: string
): Promise<TestMessageResponse> => {
    const response = await api.post<TestMessageResponse>('/whatsapp/test', {
        phone,
        template,
        businessId,
    });
    return response.data;
};

/**
 * Cerrar sesión de WhatsApp
 */
export const logoutWhatsApp = async (): Promise<{ message: string }> => {
    const response = await api.post<{ message: string }>('/whatsapp/logout');
    return response.data;
};
