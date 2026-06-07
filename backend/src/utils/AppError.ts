export class AppError extends Error {
    code: string;
    statusCode: number;
    details?: Record<string, unknown>;

    constructor(code: string, message: string, statusCode = 400, details?: Record<string, unknown>) {
        super(message);
        this.name = 'AppError';
        this.code = code;
        this.statusCode = statusCode;
        this.details = details;
    }
}
