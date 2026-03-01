import winston from 'winston';
import { config } from '../config/env';

const logFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
);

// Siempre usar consola como transporte principal
// En Vercel (serverless), el sistema de archivos es de solo lectura
// por lo que los file transports causan un crash con ENOENT
const transports: winston.transport[] = [
    new winston.transports.Console({
        format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
        ),
    }),
];

// Agregar file transports solo en entornos que no sean Vercel (local/Docker)
const isVercel = !!process.env.VERCEL;
if (!isVercel && config.nodeEnv === 'development') {
    try {
        const fs = require('fs');
        if (!fs.existsSync('logs')) fs.mkdirSync('logs', { recursive: true });
        transports.push(new winston.transports.File({ filename: 'logs/error.log', level: 'error' }));
        transports.push(new winston.transports.File({ filename: 'logs/combined.log' }));
    } catch {
        // Si no se puede crear el directorio, continuar sin file transports
    }
}

const logger = winston.createLogger({
    level: config.nodeEnv === 'development' ? 'debug' : 'info',
    format: logFormat,
    defaultMeta: { service: 'gestioncredifacil-backend' },
    transports,
});

export default logger;

