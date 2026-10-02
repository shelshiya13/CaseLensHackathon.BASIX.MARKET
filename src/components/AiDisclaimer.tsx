import React from 'react';
import { Scale } from 'lucide-react';

export const AiDisclaimer: React.FC<{ className?: string }> = ({ className = '' }) => {
  return (
    <div className={`p-2.5 bg-[#FAF7F0] border-t border-[#E4DFD3] text-[#5C5E66] text-xs flex items-center gap-2 ${className}`}>
      <Scale className="w-3.5 h-3.5 shrink-0 text-[#B08D57]" />
      <span>
        <strong>AI-assisted analysis for human review.</strong> A qualified legal professional remains responsible for all legal decisions.
      </span>
    </div>
  );
};

export const DemoBadge: React.FC<{ className?: string }> = ({ className = '' }) => {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-mono font-medium bg-[#FEFCE8] text-[#B7791F] border border-[#FCE96A] rounded ${className}`}>
      <span>DEMO CASE — fictional data</span>
    </span>
  );
};
