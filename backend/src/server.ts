import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config/env';
import logger from './utils/logger';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.middleware';
import { apiLimiter } from './middleware/rateLimiter.middleware';

// Importar rutas (las crearemos pronto)
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import auditRoutes from './routes/audit.routes';
// Importar Business routes
import businessRoutes from './routes/business.routes';
import clientRoutes from './routes/client.routes';
import creditRoutes from './routes/credit.routes';
import paymentRoutes from './routes/payment.routes';
import cashRoutes from './routes/cash.routes';
// import cashRoutes from './routes/cash.routes';
// import dashboardRoutes from './routes/dashboard.routes';
// import auditRoutes from './routes/audit.routes';

const app: Application = express();

/**
 * CONFIGURACIÓN DE SEGURIDAD - OWASP
 */

// Helmet - Headers de seguridad HTTP
// OWASP: Security Misconfiguration (A05:2021)
app.use(
    helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'"],
            },
        },
        hsts: {
            maxAge: 31536000,
            includeSubDomains: true,
            preload: true,
        },
    })
);

// CORS - Permitir solo frontend configurado
// OWASP: Security Misconfiguration (A05:2021)
app.use(
    cors({
        origin: config.frontend.url,
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
        allowedHeaders: ['Content-Type', 'Authorization'],
    })
);

// Body parser
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting general
app.use('/api/', apiLimiter);

/**
 * RUTAS
 */
app.get('/', (_req, res) => {
    res.json({
        message: 'Gestióncredifacil API',
        version: '1.0.0',
        status: 'running',
    });
});

// Rutas de API
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/businesses', businessRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/credits', creditRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/cash', cashRoutes);
// app.use('/api/cash', cashRoutes);
// app.use('/api/dashboard', dashboardRoutes);
// app.use('/api/audit', auditRoutes);

/**
 * MANEJO DE ERRORES
 */
app.use(notFoundHandler);
app.use(errorHandler);

/**
 * INICIAR SERVIDOR
 */
const PORT = config.port;

if (!process.env.VERCEL) {
    app.listen(PORT, () => {
        logger.info(`🚀 Server running on port ${PORT}`);
        logger.info(`📍 Environment: ${config.nodeEnv}`);
        logger.info(`🔗 Frontend URL: ${config.frontend.url}`);
    });
}

// Manejo de errores no capturados
process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection', { reason, promise });
});

process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception', { error });
    process.exit(1);
});

export default app;
