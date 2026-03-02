import { Client, LocalAuth } from 'whatsapp-web.js';
import qrcode from 'qrcode';
import logger from '../utils/logger';

/**
 * Servicio de gestión de WhatsApp usando whatsapp-web.js
 * Proporciona conexión por QR, envío de mensajes y formateo de plantillas
 */
class WhatsAppService {
    private client: Client;
    private qrCode: string | null = null;
    private status: 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' = 'DISCONNECTED';
    private phoneNumber: string | null = null;

    constructor() {
        logger.info('WhatsAppService constructor: Creating client');
        this.client = new Client({
            authStrategy: new LocalAuth({
                clientId: 'gestioncredifacil-session'
            }),
            puppeteer: {
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--single-process', // <- Puede ayudar en entornos con pocos recursos
                    '--disable-gpu'
                ],
                // Si estamos en macOS (darwin), intentamos usar Chrome del sistema si existe
                // pero si falla, dejamos que puppeteer use el suyo
                executablePath: process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : undefined
            }
        });

        this.setupEventListeners();
    }

    private setupEventListeners() {
        this.client.on('qr', async (qr) => {
            try {
                this.qrCode = await qrcode.toDataURL(qr);
                this.status = 'DISCONNECTED';
                logger.info('WhatsApp QR Code generated');
            } catch (err) {
                logger.error('Error generating QR code data URL', err);
            }
        });

        this.client.on('ready', () => {
            this.status = 'CONNECTED';
            this.qrCode = null;
            this.phoneNumber = this.client.info.wid.user;
            logger.info('WhatsApp Client is ready');
        });

        this.client.on('authenticated', () => {
            logger.info('WhatsApp Client authenticated');
        });

        this.client.on('auth_failure', (msg) => {
            this.status = 'DISCONNECTED';
            logger.error('WhatsApp Authentication failure', { msg });
        });

        this.client.on('disconnected', async (reason) => {
            this.status = 'DISCONNECTED';
            this.qrCode = null;
            this.phoneNumber = null;
            logger.info('WhatsApp Client disconnected', { reason });

            // Intentar re-inicializar si fue una desconexión inesperada
            try {
                await this.client.initialize();
            } catch (err) {
                logger.error('Failed to re-initialize WhatsApp client after disconnect', err);
            }
        });
    }

    /**
     * Inicializa el cliente de WhatsApp
     */
    async initialize() {
        if (this.status === 'CONNECTED' || this.status === 'CONNECTING') return;

        this.status = 'CONNECTING';
        try {
            await this.client.initialize();
            logger.info('WhatsApp Client initialization started');
        } catch (error) {
            this.status = 'DISCONNECTED';
            logger.error('Error initializing WhatsApp client', { error });
        }
    }

    /**
     * Obtiene el estado actual de la conexión
     */
    getStatus() {
        return {
            status: this.status,
            qrCode: this.qrCode,
            number: this.phoneNumber
        };
    }

    /**
     * Cierra la sesión de WhatsApp
     */
    async logout() {
        try {
            await this.client.logout();
            this.status = 'DISCONNECTED';
            this.qrCode = null;
            this.phoneNumber = null;
            logger.info('WhatsApp logged out successfully');
        } catch (error) {
            logger.error('Error during WhatsApp logout', error);
            throw error;
        }
    }

    /**
     * Formatea un mensaje de WhatsApp reemplazando variables dinámicas
     */
    formatWhatsAppMessage(
        template: string | null | undefined,
        schedule: any,
        client: any,
        business: any
    ) {
        const defaultTemplate = 'Hola {{cliente}}, te recordamos que tu cuota de {{monto}} para el negocio {{negocio}} vence el {{fecha}}.';
        let message = template || defaultTemplate;

        // Formatear monto
        const amountFormatted = new Intl.NumberFormat('es-CO', {
            style: 'currency',
            currency: 'COP',
            maximumFractionDigits: 0
        }).format(Number(schedule.scheduledAmount || 0));

        // Formatear fecha
        const dateFormatted = new Date(schedule.dueDate).toLocaleDateString('es-CO', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });

        // Reemplazar variables
        message = message.replace(/{{cliente}}/g, client.fullName || 'Cliente');
        message = message.replace(/{{monto}}/g, amountFormatted);
        message = message.replace(/{{fecha}}/g, dateFormatted);
        message = message.replace(/{{negocio}}/g, business.name || 'nuestro negocio');

        return message;
    }

    /**
     * Envía un mensaje a un número específico
     */
    async sendMessage(phone: string, message: string) {
        if (this.status !== 'CONNECTED') {
            throw new Error('El bot de WhatsApp no está conectado. Por favor vincule su cuenta.');
        }

        try {
            // Limpiar número (solo dígitos)
            let cleanPhone = phone.replace(/\D/g, '');

            // Añadir prefijo de país si no lo tiene (asumiendo Colombia +57 si tiene 10 dígitos)
            if (cleanPhone.length === 10) {
                cleanPhone = '57' + cleanPhone;
            }

            const chatId = `${cleanPhone}@c.us`;
            await this.client.sendMessage(chatId, message);
            logger.info(`Message sent to ${cleanPhone}`);
        } catch (error) {
            logger.error('Error sending WhatsApp message', { phone, error });
            throw error;
        }
    }
}

export const whatsappService = new WhatsAppService();
