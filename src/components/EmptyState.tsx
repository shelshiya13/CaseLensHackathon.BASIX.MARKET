import React from 'react';
import { LucideIcon, FileText } from 'lucide-react';

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  icon: Icon = FileText,
  actionLabel,
  onAction,
  className = ''
}) => {
  return (
    <div className={`glass-surface p-9 sm:p-11 text-center rounded-3xl ${className}`}>
      <div className="w-14 h-14 mx-auto mb-4 flex items-center justify-center rounded-2xl bg-gradient-to-br from-blue-100 via-indigo-100 to-cyan-100 border border-white text-[#2563EB] shadow-sm">
        <Icon className="w-6 h-6" strokeWidth={1.8} />
      </div>
      <h3 className="text-lg font-semibold tracking-tight text-[#172554]">{title}</h3>
      {description && <p className="mt-2 text-sm leading-relaxed text-[#52617B] max-w-md mx-auto">{description}</p>}
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="mt-4 px-3.5 py-1.5 text-xs font-medium bg-[#14213D] text-white rounded hover:bg-[#1E2D4A] transition-colors"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
};
