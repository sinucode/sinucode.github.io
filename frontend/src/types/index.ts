// Tipos de usuario y roles
export type UserRole = 'super_admin' | 'admin' | 'user';

export interface User {
    id: string;
    email: string;
    fullName: string;
    role: UserRole;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
}

// Tipos de negocio
export interface Business {
    id: string;
    name: string;
    description?: string;
    initialCapital: number;
    currentBalance: number;
    createdById: string;
    createdAt: string;
    updatedAt: string;
}

// Tipos de cliente
export interface Client {
    id: string;
    businessId: string;
    phone: string;
    cedula: string;
    fullName: string;
    address?: string;
    email?: string;
    createdAt: string;
    updatedAt: string;
}

// Tipos de crédito
export type PaymentFrequency = 'daily' | 'weekly' | 'biweekly' | 'monthly';
export type CreditStatus = 'active' | 'paid' | 'overdue' | 'cancelled';

export interface Credit {
    id: string;
    businessId: string;
    clientId: string;
    client?: Client;
    amount: number;
    interestRate: number;
    totalWithInterest: number;
    paymentFrequency: PaymentFrequency;
    startDate: string;
    endDate: string;
    termDays: number;
    remainingBalance: number;
    status: CreditStatus;
    createdById: string;
    createdAt: string;
    updatedAt: string;
    paymentSchedule?: PaymentSchedule[];
}

// Tipos de plan de pagos
export type PaymentScheduleStatus = 'pending' | 'partial' | 'paid' | 'overdue';

export interface PaymentSchedule {
    id: string;
    creditId: string;
    installmentNumber: number;
    dueDate: string;
    scheduledAmount: number;
    paidAmount: number;
    status: PaymentScheduleStatus;
    createdAt: string;
    updatedAt: string;
}

// Tipos de pago
export interface Payment {
    id: string;
    creditId: string;
    amount: number;
    paymentDate: string;
    amountToPrincipal: number;
    amountToInterest: number;
    remainingBalanceAfter: number;
    paymentMethod?: string;
    notes?: string;
    createdById: string;
    createdAt: string;
}

// Tipos de movimientos de caja
export type CashMovementType =
    | 'initial_capital'
    | 'capital_injection'
    | 'withdrawal'
    | 'loan_disbursement'
    | 'payment_received'
    | 'interest_earned';

export interface CashMovement {
    id: string;
    businessId: string;
    type: CashMovementType;
    amount: number;
    balanceAfter: number;
    description?: string;
    relatedCreditId?: string;
    relatedPaymentId?: string;
    createdById: string;
    createdAt: string;
}

// Tipos de auditoría
export interface AuditLog {
    id: string;
    userId?: string;
    businessId?: string;
    action: string;
    entityType?: string;
    entityId?: string;
    oldValues?: any;
    newValues?: any;
    ipAddress?: string;
    userAgent?: string;
    createdAt: string;
    user?: {
        fullName: string;
        email: string;
    };
}

// Tipos de API Response
export interface ApiResponse<T> {
    success: boolean;
    data?: T;
    error?: string;
    message?: string;
}

export interface PaginatedResponse<T> {
    success: boolean;
    data: T[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
}

// Tipos de autenticación
export interface LoginRequest {
    email: string;
    password: string;
}

export interface LoginResponse {
    accessToken: string;
    refreshToken: string;
    user: {
        id: string;
        email: string;
        fullName: string;
        role: UserRole;
    };
}

export interface AuthState {
    user: User | null;
    accessToken: string | null;
    refreshToken: string | null;
    isAuthenticated: boolean;
    isLoading: boolean;
}

// Tipos de dashboard
export interface DashboardSummary {
    totalCapital: number;
    totalProjectedProfit: number;
    totalActualProfit: number;
    currentBalance: number;
    activeCredits: number;
    activeClients: number;
    paymentsToday: number;
    overduePayments: number;
}
