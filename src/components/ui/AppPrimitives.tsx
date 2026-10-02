import React, { useEffect } from 'react';
import { motion, useMotionValue, useReducedMotion, useTransform, animate } from 'motion/react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export const AppButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; icon?: React.ReactNode }> = ({ variant = 'primary', icon, className = '', children, ...props }) => {
  const styles: Record<ButtonVariant, string> = {
    primary: 'bg-blue-600 text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700',
    secondary: 'border border-slate-200 bg-white text-slate-700 shadow-sm hover:border-blue-200 hover:bg-blue-50',
    ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
    danger: 'bg-rose-600 text-white shadow-sm hover:bg-rose-700'
  };
  return <button {...props} className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-50 ${styles[variant]} ${className}`}>{icon}{children}</button>;
};

export const AppInput: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = ({ className = '', ...props }) => (
  <input {...props} className={`min-h-11 w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-gray-900 shadow-sm caret-blue-600 placeholder:text-gray-500 focus:border-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-100 ${className}`} />
);

export const AppBadge: React.FC<{ children: React.ReactNode; tone?: 'blue' | 'violet' | 'cyan' | 'green' | 'amber' | 'rose' | 'slate'; className?: string }> = ({ children, tone = 'slate', className = '' }) => {
  const tones = { blue: 'bg-blue-50 text-blue-800 ring-blue-200', violet: 'bg-violet-50 text-violet-800 ring-violet-200', cyan: 'bg-cyan-50 text-cyan-800 ring-cyan-200', green: 'bg-emerald-50 text-emerald-800 ring-emerald-200', amber: 'bg-amber-50 text-amber-900 ring-amber-200', rose: 'bg-rose-50 text-rose-800 ring-rose-200', slate: 'bg-slate-100 text-slate-700 ring-slate-200' };
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${tones[tone]} ${className}`}>{children}</span>;
};

export const AppCard: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className = '', children, ...props }) => (
  <div {...props} className={`rounded-2xl border border-slate-200/80 bg-white shadow-[0_14px_40px_-28px_rgba(15,23,42,.25)] ${className}`}>{children}</div>
);

export const AppSection: React.FC<{ title: string; eyebrow?: string; action?: React.ReactNode; children: React.ReactNode; className?: string }> = ({ title, eyebrow, action, children, className = '' }) => (
  <section className={`min-w-0 rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-[0_14px_40px_-28px_rgba(15,23,42,.25)] backdrop-blur-sm sm:p-6 ${className}`}>
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div>{eyebrow && <p className="mb-1 text-[10px] font-bold uppercase tracking-[.18em] text-blue-700">{eyebrow}</p>}<h2 className="text-base font-bold tracking-tight text-slate-900 sm:text-lg">{title}</h2></div>{action}</div>
    {children}
  </section>
);

export const AppStatCard: React.FC<{ label: string; value: number; detail: string; icon: React.ReactNode; gradient: string; href?: string; loading?: boolean }> = ({ label, value, detail, icon, gradient, href, loading = false }) => {
  const reduced = useReducedMotion();
  const count = useMotionValue(0);
  const rounded = useTransform(count, current => Math.round(current));
  useEffect(() => {
    const controls = animate(count, value, { duration: reduced ? 0 : 0.85, ease: 'easeOut' });
    return () => controls.stop();
  }, [count, value, reduced]);
  const content = <>
    <div className="flex items-start justify-between gap-3"><div className="grid size-11 place-items-center rounded-2xl bg-white/15 text-white ring-1 ring-white/20 [&_svg]:size-5">{icon}</div><span className="rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-semibold text-white/90">LIVE</span></div>
    <div className="mt-5"><p className="text-xs font-semibold text-white/85">{label}</p>{loading ? <span className="mt-2 block h-9 w-16 animate-pulse rounded-lg bg-white/20" role="status" aria-label={'Loading ' + label} /> : <motion.p className="mt-1 text-3xl font-bold tracking-tight text-white tabular-nums">{rounded}</motion.p>}<p className="mt-1 text-[11px] leading-5 text-white/75">{loading ? 'Updating portfolio…' : detail}</p></div>
  </>;
  const classes = `group relative min-w-0 overflow-hidden rounded-2xl bg-gradient-to-br ${gradient} p-4 text-left shadow-lg shadow-slate-900/10 transition duration-200 hover:-translate-y-1 hover:shadow-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 sm:p-5`;
  return href ? <a href={href} className={classes}>{content}</a> : <div className={classes}>{content}</div>;
};

export const AppTable: React.FC<React.TableHTMLAttributes<HTMLTableElement>> = ({ className = '', children, ...props }) => (
  <div className="max-w-full overflow-x-auto rounded-xl border border-slate-200"><table {...props} className={`w-full min-w-[760px] text-left text-sm ${className}`}>{children}</table></div>
);

export const AppModal: React.FC<{ open: boolean; title: string; onClose: () => void; children: React.ReactNode }> = ({ open, title, onClose, children }) => {
  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [open, onClose]);
  if (!open) return null;
  return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4 backdrop-blur-sm" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><section role="dialog" aria-modal="true" aria-labelledby="app-modal-title" className="w-full max-w-lg rounded-2xl border border-white/70 bg-white p-6 shadow-2xl"><div className="mb-4 flex items-center justify-between gap-4"><h2 id="app-modal-title" className="text-lg font-bold text-slate-900">{title}</h2><button type="button" onClick={onClose} aria-label="Close dialog" className="grid size-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-blue-600">×</button></div>{children}</section></div>;
};
