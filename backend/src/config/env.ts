import dotenv from 'dotenv';

dotenv.config();

export const config = {
    port: process.env.PORT || 3000,
    nodeEnv: process.env.NODE_ENV || 'development',

    jwt: {
        secret: process.env.JWT_SECRET || 'fallback-secret-change-me',
        refreshSecret: process.env.JWT_REFRESH_SECRET || 'fallback-refresh-secret-change-me',
        expiresIn: process.env.JWT_EXPIRES_IN || '15m',
        refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    },

    frontend: {
        url: process.env.FRONTEND_URL || 'http://localhost:5173',
    },

    email: {
        resendApiKey: process.env.RESEND_API_KEY || '',
        fromAddress: process.env.EMAIL_FROM || 'noreply@gestioncredifacil.com',
    },

    database: {
        url: process.env.DATABASE_URL,
    },
};

// Validar que las variables críticas estén configuradas
if (config.nodeEnv === 'production') {
    if (!config.database.url) {
        throw new Error('DATABASE_URL must be defined in production');
    }
    if (config.jwt.secret === 'fallback-secret-change-me') {
        throw new Error('JWT_SECRET must be defined in production');
    }
    if (config.jwt.refreshSecret === 'fallback-refresh-secret-change-me') {
        throw new Error('JWT_REFRESH_SECRET must be defined in production');
    }
}
