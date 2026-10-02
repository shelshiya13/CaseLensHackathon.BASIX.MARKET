import React from 'react';
import {
  AlertTriangle,
  FileQuestion,
  CheckCircle2,
  Clock,
  UserCheck,
  FileText,
  Lock,
  Loader2
} from 'lucide-react';

interface StatusBadgeProps {
  status: string;
  className?: string;
  size?: 'sm' | 'md';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, className = '', size = 'md' }) => {
  const isSm = size === 'sm';
  const pad = isSm ? 'px-2.5 py-1 text-[11px]' : 'px-3 py-1.5 text-xs font-semibold';

  switch (status) {
    case 'Conflict Detected':
      return (
        <span className={`inline-flex items-center gap-1.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 ${pad} ${className}`}>
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-rose-600" />
          <span>Conflict Detected</span>
        </span>
      );

    case 'Missing Evidence':
      return (
        <span className={`inline-flex items-center gap-1.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 ${pad} ${className}`}>
          <FileQuestion className="w-3.5 h-3.5 shrink-0 text-amber-600" />
          <span>Missing Evidence</span>
        </span>
      );

    case 'Human Review':
      return (
        <span className={`inline-flex items-center gap-1.5 rounded-full bg-violet-50 text-violet-800 border border-violet-200 ${pad} ${className}`}>
          <UserCheck className="w-3.5 h-3.5 shrink-0 text-violet-600" />
          <span>Human Review</span>
        </span>
      );

    case 'Decision/Assessment Generated':
      return (
        <span className={`inline-flex items-center gap-1.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 ${pad} ${className}`}>
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
          <span>Assessment Generated</span>
        </span>
      );

    case 'Under Analysis':
      return (
        <span className={`inline-flex items-center gap-1.5 rounded-full bg-blue-50 text-blue-800 border border-blue-200 ${pad} ${className}`}>
          <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin text-blue-600" />
          <span>Under Analysis</span>
        </span>
      );

    case 'Evidence Review':
      return (
        <span className={`inline-flex items-center gap-1.5 rounded-full bg-indigo-50 text-indigo-800 border border-indigo-200 ${pad} ${className}`}>
          <FileText className="w-3.5 h-3.5 shrink-0 text-indigo-600" />
          <span>Evidence Review</span>
        </span>
      );

    case 'Closed':
      return (
        <span className={`inline-flex items-center gap-1.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 ${pad} ${className}`}>
          <Lock className="w-3.5 h-3.5 shrink-0 text-slate-500" />
          <span>Closed</span>
        </span>
      );

    case 'New':
    default:
      return (
        <span className={`inline-flex items-center gap-1.5 rounded-full bg-cyan-50 text-cyan-800 border border-cyan-200 ${pad} ${className}`}>
          <Clock className="w-3.5 h-3.5 shrink-0 text-cyan-600" />
          <span>{status || 'New'}</span>
        </span>
      );
  }
};
