import cron from 'node-cron';
import prisma from '../config/database';
import { whatsappService } from '../services/whatsapp.service';
import logger from '../utils/logger';

// Ejecutar todos los días a las 12:00 PM hora de Colombia (America/Bogota)
// 0 12 * * * = minuto 0, hora 12, cualquier día del mes, cualquier mes, cualquier día de la semana
const CRON_SCHEDULE = '0 12 * * *';
const TIMEZONE = 'America/Bogota';

/**
 * Job para enviar recordatorios de pago por WhatsApp
 */
export const startWhatsAppRemindersJob = () => {
    logger.info(`Iniciando cron job de WhatsApp Reminders con horario '${CRON_SCHEDULE}' en zona horaria '${TIMEZONE}'`);

    cron.schedule(CRON_SCHEDULE, async () => {
        logger.info('Ejecutando cron job de recordatorios de WhatsApp (12:00 PM)...');

        try {
            // 1. Obtener la fecha de hoy al mediodía en la zona horaria correcta
            const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).format(new Date());
            const startOfToday = new Date(`${todayStr}T00:00:00.000-05:00`);
            const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);

            // 2. Buscar todas las cuotas (paymentSchedule) pendientes o parciales que vencen hoy
            const dueSchedules = await prisma.paymentSchedule.findMany({
                where: {
                    dueDate: {
                        gte: startOfToday,
                        lt: endOfToday,
                    },
                    status: {
                        in: ['pending', 'partial'],
                    },
                    credit: {
                        status: 'active'
                    }
                },
                include: {
                    credit: {
                        include: {
                            client: true,
                            business: true
                        }
                    }
                }
            });

            logger.info(`Encontradas ${dueSchedules.length} cuotas pendientes para hoy.`);

            // Verificar si hay cuotas y si el bot está conectado
            if (dueSchedules.length === 0) {
                return;
            }

            const wpStatus = whatsappService.getStatus();
            if (wpStatus.status !== 'CONNECTED') {
                logger.warn('Cron Job cancelado: El bot de WhatsApp no está conectado.');
                return;
            }

            let sentCount = 0;
            let errorCount = 0;

            // 3. Iterar y enviar mensajes
            for (const schedule of dueSchedules) {
                const credit = schedule.credit;
                const client = credit.client;
                const business = credit.business;

                // Solo enviar si el negocio tiene una plantilla guardada
                // Y si el cliente tiene un número de teléfono válido
                const templateStr = (business as any).whatsappMessageTemplate;
                if (templateStr && client.phone) {
                    try {
                        const messageText = whatsappService.formatWhatsAppMessage(
                            templateStr,
                            schedule,
                            client,
                            business
                        );

                        // Dar un pequeño delay de 2 segundos entre mensajes para evitar bans de WhatsApp
                        await new Promise(resolve => setTimeout(resolve, 2000));

                        await whatsappService.sendMessage(client.phone, messageText);
                        sentCount++;
                    } catch (error) {
                        logger.error(`Error enviando recordatorio al cliente ${client.id} (Tel: ${client.phone})`, error);
                        errorCount++;
                    }
                }
            }

            logger.info(`Cron Job finalizado: ${sentCount} mensajes enviados, ${errorCount} errores.`);

        } catch (error) {
            logger.error('Error crítico ejecutando el cron job de WhatsApp Reminders', error);
        }
    }, {
        scheduled: true,
        timezone: TIMEZONE
    } as any);
};
