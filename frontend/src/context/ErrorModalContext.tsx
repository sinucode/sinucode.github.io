import { createContext, useCallback, useContext, useState, ReactNode } from 'react';
import { ErrorModal } from '../components/common/ErrorModal';
import { getApiError, ApiError } from '../utils/errorHandler';

interface ErrorModalContextValue {
    showError: (err: unknown) => void;
}

const ErrorModalContext = createContext<ErrorModalContextValue | null>(null);

export function ErrorModalProvider({ children }: { children: ReactNode }) {
    const [current, setCurrent] = useState<ApiError | null>(null);

    const showError = useCallback((err: unknown) => {
        setCurrent(getApiError(err));
    }, []);

    const handleClose = useCallback(() => setCurrent(null), []);

    return (
        <ErrorModalContext.Provider value={{ showError }}>
            {children}
            {current && (
                <ErrorModal
                    code={current.code}
                    message={current.message}
                    details={current.details}
                    onClose={handleClose}
                />
            )}
        </ErrorModalContext.Provider>
    );
}

export function useErrorModal() {
    const ctx = useContext(ErrorModalContext);
    if (!ctx) throw new Error('useErrorModal must be used inside ErrorModalProvider');
    return ctx;
}
