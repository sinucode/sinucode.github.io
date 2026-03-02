import { Router } from 'express';
import { whatsappService } from '../services/whatsapp.service';
import prisma from '../config/database';
import { authenticate, requireMinRole } from '../middleware/auth.middleware';
import logger from '../utils/logger';

const router = Router();

// Todas las rutas requieren autenticación mínima de admin para gestionar el bot
router.use(authenticate, requireMinRole('admin'));

/**
 * GET /api/whatsapp/status
 * Obtiene el estado actual de la conexión y el QR si está disponible
 */
router.get('/status', async (_req, res) => {
    try {
        const status = whatsappService.getStatus();

        // Si no está conectado ni conectando, y no hay QR, intentar inicializar
        if (status.status === 'DISCONNECTED' && !status.qrCode) {
            whatsappService.initialize().catch(err => {
                logger.error('Failed to auto-initialize WhatsApp in status route', err);
            });
        }

        return res.json(status);
    } catch (error) {
        logger.error('Error getting WhatsApp status', error);
        return res.status(500).json({ error: 'Error al obtener el estado de WhatsApp' });
    }
});

/**
 * PUT /api/whatsapp/template
 * Guarda la plantilla de mensaje para un negocio específico
 */
router.put('/template', async (req, res) => {
    const { template, businessId } = req.body;

    if (!businessId) {
        return res.status(400).json({ error: 'ID de negocio es requerido' });
    }

    try {
        const business = await prisma.business.update({
            where: { id: businessId },
            data: { whatsappMessageTemplate: template } as any
        });

        // Auditar el cambio
        await prisma.auditLog.create({
            data: {
                userId: req.user?.userId,
                businessId: businessId,
                action: 'UPDATE_WHATSAPP_TEMPLATE',
                description: `Plantilla de WhatsApp actualizada para el negocio ${(business as any).name}`,
                entityType: 'Business',
                entityId: businessId,
                newValues: { template }
            }
        });

        return res.json({
            message: 'Plantilla guardada correctamente',
            template: (business as any).whatsappMessageTemplate
        });
    } catch (error) {
        logger.error('Error saving WhatsApp template', error);
        return res.status(500).json({ error: 'Error al guardar la plantilla' });
    }
});

/**
 * POST /api/whatsapp/test
 * Envía un mensaje de prueba formateado con datos de ejemplo
 */
router.post('/test', async (req, res) => {
    const { phone, template, businessId } = req.body;

    if (!phone || !template) {
        return res.status(400).json({ error: 'Número de teléfono y plantilla son requeridos' });
    }

    try {
        // Datos de prueba (dummy)
        const dummyData = {
            cliente: 'Cliente de Prueba',
            monto: 150000,
            fecha: new Date().toISOString(),
            negocio: 'Mi Negocio de Créditos'
        };

        // Si se provee businessId, usamos el nombre real del negocio
        if (businessId) {
            const business = await prisma.business.findUnique({
                where: { id: businessId },
                select: { name: true }
            });
            if (business) {
                dummyData.negocio = business.name;
            }
        }

        const formattedMessage = whatsappService.formatWhatsAppMessage(
            template,
            { scheduledAmount: dummyData.monto, dueDate: dummyData.fecha },
            { fullName: dummyData.cliente },
            { name: dummyData.negocio }
        );

        await whatsappService.sendMessage(phone, formattedMessage);

        return res.json({
            message: 'Mensaje de prueba enviado correctamente',
            formattedMessage
        });
    } catch (error: any) {
        logger.error('Error sending test WhatsApp message', error);
        return res.status(500).json({ error: error.message || 'Error al enviar el mensaje de prueba' });
    }
});

/**
 * POST /api/whatsapp/logout
 * Desvincula la cuenta de WhatsApp actual
 */
router.post('/logout', async (_req, res) => {
    try {
        await whatsappService.logout();
        return res.json({ message: 'Sesión de WhatsApp cerrada correctamente' });
    } catch (error) {
        logger.error('Error logging out WhatsApp', error);
        return res.status(500).json({ error: 'Error al cerrar sesión de WhatsApp' });
    }
});

export default router;
