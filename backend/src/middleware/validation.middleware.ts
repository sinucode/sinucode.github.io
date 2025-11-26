import { Request, Response, NextFunction } from 'express';
import { validationResult, ValidationChain } from 'express-validator';

/**
 * Middleware para manejar resultados de validación
 * OWASP: Injection (A03:2021) y Data Integrity Failures (A08:2021)
 */
export const validate = (validations: ValidationChain[]) => {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        // Ejecutar todas las validaciones
        for (const validation of validations) {
            await validation.run(req);
        }

        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            res.status(400).json({
                error: 'Validation failed',
                details: errors.array(),
            });
            return;
        }

        next();
    };
};
