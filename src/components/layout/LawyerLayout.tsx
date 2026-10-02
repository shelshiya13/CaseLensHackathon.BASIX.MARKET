import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Scale, LayoutDashboard, Briefcase, PlusCircle, Settings, LogOut } from 'lucide-react';
import { useAuth } from '../../lib/auth.js';
import { NotificationBell } from '../NotificationBell.js';

export const LawyerLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const isNavActive = (path: string) => {
    if (path === '/lawyer/cases') {
      return location.pathname === path || (location.pathname.startsWith(`${path}/`) && location.pathname !== '/lawyer/cases/new');
    }
    if (path === '/lawyer/cases/new') return location.pathname === path;
    return location.pathname === path || (path !== '/lawyer/dashboard' && location.pathname.startsWith(path));
  };

  const navItems = [
    { label: 'Dashboard', path: '/lawyer/dashboard', icon: LayoutDashboard },
    { label: 'Cases', path: '/lawyer/cases', icon: Briefcase },
    { label: 'New Case', path: '/lawyer/cases/new', icon: PlusCircle },
    { label: 'System & Status', path: '/lawyer/system', icon: Settings }
  ];

  return (
    <div className="app-shell app-shell-counsel min-h-screen flex text-[#2B2D33]">
      {/* Left Sidebar */}
      <aside className="sidebar-glass hidden md:flex w-60 text-white flex-col shrink-0 border-r">
        {/* Brand */}
        <div className="p-5 border-b border-white/10">
          <Link to="/lawyer/dashboard" className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#60A5FA] via-[#4F46E5] to-[#7C3AED] flex items-center justify-center text-white shadow-lg shadow-blue-950/25">
              <Scale className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="font-legal-heading text-lg font-bold tracking-wide">CaseLens</span>
              <span className="block text-[10px] text-[#E4DFD3]/70 uppercase tracking-widest">Evidence Platform</span>
            </div>
          </Link>
        </div>

        {/* Navigation */}
        <nav aria-label="Primary navigation" className="flex-1 p-3 space-y-1">
          {navItems.map(item => {
            const Icon = item.icon;
            const active = isNavActive(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                aria-current={active ? 'page' : undefined}
                className={`premium-link flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium rounded-xl ${
                  active
                    ? 'bg-gradient-to-r from-[#2563EB]/30 to-[#7C3AED]/25 text-white ring-1 ring-white/15 font-semibold shadow-lg shadow-blue-950/15'
                    : 'text-slate-300 hover:bg-white/8 hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* User Footer */}
        <div className="p-4 border-t border-white/10 bg-black/10">
          <div className="flex items-center justify-between">
            <div className="truncate pr-2">
              <span className="block text-xs font-medium text-white truncate">{user?.name}</span>
              <span className="block text-[11px] text-[#E4DFD3]/60 truncate font-mono">{user?.email}</span>
            </div>
            <button
              onClick={handleLogout}
              className="p-1.5 hover:bg-white/10 rounded text-white/70 hover:text-white transition-colors"
              title="Sign out"
              aria-label="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="topbar-glass h-16 border-b px-4 sm:px-7 flex items-center justify-between text-white">
          <div className="flex items-center gap-3">
            <Link to="/lawyer/dashboard" className="md:hidden flex items-center gap-2 text-white" aria-label="CaseLens dashboard">
              <Scale className="w-5 h-5 text-[#67E8F9]" />
              <span className="font-legal-heading text-base font-bold">CaseLens</span>
            </Link>
            <span className="hidden md:inline text-xs uppercase tracking-wider text-[#93C5FD] font-semibold">Counsel Workspace</span>
            <span className="hidden sm:inline text-xs text-white/55">/</span>
            <span className="hidden sm:inline text-xs text-white/75 truncate max-w-48">{user?.name || 'Counsel'}</span>
          </div>
          <div className="flex items-center gap-4">
            <NotificationBell />
          </div>
        </header>

        <nav aria-label="Primary navigation" className="main-glass-nav md:hidden flex overflow-x-auto border-b border-white/10 px-2 py-2">
          {navItems.map(item => {
            const Icon = item.icon;
            const active = isNavActive(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                aria-current={active ? 'page' : undefined}
                className={`premium-link shrink-0 flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-medium ${
                  active ? 'bg-gradient-to-r from-[#2563EB]/35 to-[#7C3AED]/30 text-white ring-1 ring-white/15' : 'text-white/75 hover:bg-white/10'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
};
