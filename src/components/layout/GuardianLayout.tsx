import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Scale, LogOut, Shield } from 'lucide-react';
import { useAuth } from '../../lib/auth.js';
import { NotificationBell } from '../NotificationBell.js';

export const GuardianLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <div className="app-shell app-shell-guardian min-h-screen flex flex-col text-[#2B2D33]">
      {/* Top Header */}
      <header className="guardian-glass-header text-white border-b px-4 py-3.5 sm:px-8">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#22D3EE] to-[#2563EB] flex items-center justify-center text-white shadow-lg shadow-cyan-950/20">
              <Scale className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="font-legal-heading text-lg font-bold">CaseLens</span>
              <span className="block text-[10px] text-[#E4DFD3]/80 uppercase tracking-wider">Client & Guardian Portal</span>
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <NotificationBell />
            <div className="hidden sm:block text-right">
              <span className="block font-medium text-white">{user?.name}</span>
              <span className="block text-[#E4DFD3]/60 font-mono text-[11px]">{user?.email || user?.mobile}</span>
            </div>
            <button
              onClick={handleLogout}
              className="p-1.5 hover:bg-white/10 rounded text-white/80 hover:text-white transition-colors"
              title="Sign out"
              aria-label="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Body */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-4 sm:p-6 sm:py-8">
        {children}
      </main>

      {/* Footer Legal Notice */}
      <footer className="glass-surface border-t border-white/70 py-4 text-center text-xs text-[#52617B] px-4">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-[#14213D]">
            <Shield className="w-3.5 h-3.5 text-[#B08D57]" />
            <span>Secure Client Portal</span>
          </div>
          <p>For legal advice or questions about your case record, please contact your attorney directly.</p>
        </div>
      </footer>
    </div>
  );
};
