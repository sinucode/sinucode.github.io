import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import { useAuthInit } from './hooks/useAuthInit';
import LoginPage from './pages/LoginPage';
import DashboardLayout from './layouts/DashboardLayout';
import DashboardHome from './pages/DashboardHome';
import SettingsPage from './pages/SettingsPage';
import BusinessPage from './pages/BusinessPage';
import ClientsPage from './pages/ClientsPage';
import CreditsPage from './pages/CreditsPage';
import CreditDetailPage from './pages/CreditDetailPage';
import PaymentsPage from './pages/PaymentsPage';
import CashPage from './pages/CashPage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
    const { isAuthenticated, isLoading } = useAuthStore();

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
            </div>
        );
    }

    if (!isAuthenticated) {
        return <Navigate to="/login" replace />;
    }

    return <>{children}</>;
}

function App() {
    // Inicializar la autenticación al cargar la app
    useAuthInit();

    return (
        <Router>
            <Routes>
                {/* Ruta pública - Login */}
                <Route path="/login" element={<LoginPage />} />
                {/* Rutas protegidas */}
                <Route
                    path="/"
                    element={
                        <ProtectedRoute>
                            <DashboardLayout />
                        </ProtectedRoute>
                    }
                >
                    {/* Nested routes within DashboardLayout */}
                    <Route index element={<DashboardHome />} />
                    <Route path="dashboard" element={<DashboardHome />} />
                    <Route path="settings" element={<SettingsPage />} />
                    <Route path="businesses" element={<BusinessPage />} />
                    <Route path="clients" element={<ClientsPage />} />
                    <Route path="credits" element={<CreditsPage />} />
                    <Route path="credits/:id" element={<CreditDetailPage />} />
                    <Route path="payments" element={<PaymentsPage />} />
                    <Route path="cash" element={<CashPage />} />
                    <Route path="*" element={<Navigate to="/dashboard" replace />} />
                </Route>
                {/* Redirección por defecto para rutas no coincidentes fuera de la autenticación */}
                <Route path="*" element={<Navigate to="/login" replace />} />
            </Routes>
        </Router>
    );
}

export default App;
