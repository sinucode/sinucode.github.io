import winston from 'winston';
import { config } from '../config/env';

const logFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
);

const logger = winston.createLogger({
    level: config.nodeEnv === 'development' ? 'debug' : 'info',
    format: logFormat,
    defaultMeta: { service: 'gestioncredifacil-backend' },
    transports: [
        // Escribir logs de error a archivo
        new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
        // Escribir todos los logs a archivo
        new winston.transports.File({ filename: 'logs/combined.log' }),
    ],
});

// En desarrollo, también mostrar en consola
if (config.nodeEnv !== 'production') {
    logger.add(
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            ),
        })
    );
}

export default logger;
