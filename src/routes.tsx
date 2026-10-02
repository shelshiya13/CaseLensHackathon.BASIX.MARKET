import React, { Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './lib/auth.js';

// Layouts
import { LawyerLayout } from './components/layout/LawyerLayout.js';
import { GuardianLayout } from './components/layout/GuardianLayout.js';

const RoleSelect = React.lazy(() => import('./pages/Landing/RoleSelect.js').then(module => ({ default: module.RoleSelect })));
const LawyerLogin = React.lazy(() => import('./pages/auth/LawyerLogin.js').then(module => ({ default: module.LawyerLogin })));
const GuardianOtp = React.lazy(() => import('./pages/auth/GuardianOtp.js').then(module => ({ default: module.GuardianOtp })));
const LawyerDashboard = React.lazy(() => import('./pages/lawyer/Dashboard.js').then(module => ({ default: module.Dashboard })));
const LawyerCases = React.lazy(() => import('./pages/lawyer/Cases.js').then(module => ({ default: module.Cases })));
const NewCase = React.lazy(() => import('./pages/lawyer/NewCase.js').then(module => ({ default: module.NewCase })));
const CaseWorkspace = React.lazy(() => import('./pages/lawyer/CaseWorkspace.js').then(module => ({ default: module.CaseWorkspace })));
const SystemStatusPage = React.lazy(() => import('./pages/lawyer/SystemStatusPage.js').then(module => ({ default: module.SystemStatusPage })));
const GuardianDashboard = React.lazy(() => import('./pages/guardian/GuardianDashboard.js').then(module => ({ default: module.GuardianDashboard })));
const GuardianCase = React.lazy(() => import('./pages/guardian/GuardianCase.js').then(module => ({ default: module.GuardianCase })));

const PageLoading: React.FC = () => (
  <div className="page-enter min-h-64 p-6 sm:p-10" aria-live="polite" aria-busy="true">
    <div className="h-8 w-56 rounded-xl bg-blue-100/80 animate-pulse" />
    <div className="mt-4 h-32 rounded-2xl bg-white/70 border border-white/80 animate-pulse" />
  </div>
);

const LawyerRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-8 text-center text-xs text-[#5C5E66]">Verifying counsel session...</div>;
  if (!user || user.role !== 'lawyer') {
    return <Navigate to="/auth/lawyer" replace />;
  }
  return <LawyerLayout>{children}</LawyerLayout>;
};

const GuardianRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-8 text-center text-xs text-[#5C5E66]">Verifying client session...</div>;
  if (!user || user.role !== 'guardian') {
    return <Navigate to="/auth/guardian" replace />;
  }
  return <GuardianLayout>{children}</GuardianLayout>;
};

export const AppRoutes: React.FC = () => {
  return (
    <Suspense fallback={<PageLoading />}>
    <Routes>
      <Route path="/" element={<RoleSelect />} />
      <Route path="/auth/lawyer" element={<LawyerLogin />} />
      <Route path="/auth/guardian" element={<GuardianOtp />} />

      {/* Lawyer Routes */}
      <Route
        path="/lawyer/dashboard"
        element={
          <LawyerRoute>
            <LawyerDashboard />
          </LawyerRoute>
        }
      />
      <Route
        path="/lawyer/cases"
        element={
          <LawyerRoute>
            <LawyerCases />
          </LawyerRoute>
        }
      />
      <Route
        path="/lawyer/cases/new"
        element={
          <LawyerRoute>
            <NewCase />
          </LawyerRoute>
        }
      />
      <Route
        path="/lawyer/cases/:id"
        element={
          <LawyerRoute>
            <CaseWorkspace />
          </LawyerRoute>
        }
      />
      <Route
        path="/lawyer/system"
        element={
          <LawyerRoute>
            <SystemStatusPage />
          </LawyerRoute>
        }
      />

      {/* Guardian Routes */}
      <Route
        path="/guardian/dashboard"
        element={
          <GuardianRoute>
            <GuardianDashboard />
          </GuardianRoute>
        }
      />
      <Route
        path="/guardian/cases/:id"
        element={
          <GuardianRoute>
            <GuardianCase />
          </GuardianRoute>
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
  );
};
