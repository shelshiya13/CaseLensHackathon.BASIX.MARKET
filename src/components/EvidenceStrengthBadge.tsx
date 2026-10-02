import React from 'react';
import { BadgeCheck, CircleHelp, ShieldAlert, ShieldCheck, ThumbsDown, ThumbsUp } from 'lucide-react';
import type { EvidenceStrength } from '../lib/evidenceStrength.js';

const appearance: Record<EvidenceStrength, { icon: React.ElementType; classes: string }> = {
  Verified: { icon: BadgeCheck, classes: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  Contradicted: { icon: ThumbsDown, classes: 'bg-rose-50 text-rose-800 border-rose-200' },
  Supported: { icon: ThumbsUp, classes: 'bg-blue-50 text-blue-800 border-blue-200' },
  Weak: { icon: ShieldAlert, classes: 'bg-amber-50 text-amber-800 border-amber-200' },
  'Insufficient Evidence': { icon: CircleHelp, classes: 'bg-slate-100 text-slate-700 border-slate-200' },
  Unverified: { icon: ShieldCheck, classes: 'bg-violet-50 text-violet-800 border-violet-200' }
};

export const EvidenceStrengthBadge: React.FC<{ strength: EvidenceStrength; compact?: boolean }> = ({ strength, compact = false }) => {
  const { icon: Icon, classes } = appearance[strength];
  return (
    <span aria-label={`Evidence strength: ${strength}`} className={`inline-flex items-center gap-1.5 rounded-full border font-semibold ${compact ? 'px-2 py-1 text-[10px]' : 'px-2.5 py-1.5 text-xs'} ${classes}`}>
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      <span>{strength}</span>
    </span>
  );
};
