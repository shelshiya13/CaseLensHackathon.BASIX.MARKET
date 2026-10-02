import React from 'react';

export const DemoBadge: React.FC<{ className?: string }> = ({ className = '' }) => {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-mono font-medium bg-[#FEFCE8] text-[#B7791F] border border-[#FCE96A] rounded ${className}`}>
      <span>DEMO CASE — fictional data</span>
    </span>
  );
};
