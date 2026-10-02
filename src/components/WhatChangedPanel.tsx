import React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  FilePlus2,
  FileQuestion,
  GitCompareArrows,
  History,
  Scale,
  ShieldCheck,
  TrendingDown,
  TrendingUp
} from 'lucide-react';
import type { AnalysisDelta } from '../lib/analysisDelta.js';

interface WhatChangedPanelProps {
  delta: AnalysisDelta | null;
  onSelectTab: (tab: string) => void;
}

type ChangeMetric = {
  label: string;
  value: number;
  tab: string;
  tone: 'blue' | 'green' | 'red' | 'amber' | 'violet';
  icon: React.ElementType;
};

export const WhatChangedPanel: React.FC<WhatChangedPanelProps> = ({ delta, onSelectTab }) => {
  const reduceMotion = useReducedMotion();
  if (!delta) return null;

  const metrics: ChangeMetric[] = [
    { label: 'New evidence', value: delta.newEvidence.length, tab: 'evidence', tone: 'blue', icon: FilePlus2 },
    { label: 'Claims strengthened', value: delta.strengthenedClaims.length, tab: 'reasoning', tone: 'green', icon: TrendingUp },
    { label: 'Claims weakened', value: delta.weakenedClaims.length, tab: 'reasoning', tone: 'red', icon: TrendingDown },
    { label: 'Evidence resolved', value: delta.resolvedEvidence.length, tab: 'evidence', tone: 'green', icon: CheckCircle2 },
    { label: 'Gaps resolved', value: delta.resolvedMissing.length, tab: 'missing', tone: 'green', icon: ShieldCheck },
    { label: 'New evidence gaps', value: delta.newMissing.length, tab: 'missing', tone: 'amber', icon: FileQuestion },
    { label: 'New conflicts', value: delta.newConflicts.length, tab: 'conflicts', tone: 'red', icon: AlertTriangle },
    { label: 'Conflicts resolved', value: delta.resolvedConflicts.length, tab: 'conflicts', tone: 'green', icon: GitCompareArrows },
    { label: 'Timeline changes', value: delta.timelineChanges.length, tab: 'timeline', tone: 'violet', icon: Activity }
  ];

  const toneClasses: Record<ChangeMetric['tone'], string> = {
    blue: 'text-violet-800 bg-violet-50 border-violet-200',
    green: 'text-emerald-700 bg-emerald-50 border-emerald-100',
    red: 'text-rose-700 bg-rose-50 border-rose-100',
    amber: 'text-amber-800 bg-amber-50 border-amber-100',
    violet: 'text-violet-700 bg-violet-50 border-violet-100'
  };

  const changedItems = [
    ...delta.newEvidence.map(item => ({ label: item.fact_label || item.fact_text || item.ref || item.evidence_ref || 'New evidence', ref: item.evidence_ref || item.ref, tone: 'blue' as const })),
    ...delta.strengthenedClaims.map(item => ({ label: item.statement, ref: item.findingId, tone: 'green' as const })),
    ...delta.weakenedClaims.map(item => ({ label: item.statement, ref: item.findingId, tone: 'red' as const })),
    ...delta.newMissing.map(item => ({ label: item.required_item || item.requiredItem || item.ref || 'New evidence gap', ref: item.missing_ref || item.ref, tone: 'amber' as const })),
    ...delta.newConflicts.map(item => ({ label: item.description || item.ref || 'New conflict', ref: item.conflict_ref || item.ref, tone: 'red' as const })),
    ...delta.resolvedConflicts.map(item => ({ label: item.description || item.ref || 'Conflict resolved', ref: item.conflict_ref || item.ref, tone: 'green' as const }))
  ].slice(0, 4);

  return (
    <section aria-label="What changed in the latest analysis" className="glass-surface overflow-hidden rounded-3xl border border-white/80 shadow-xl shadow-blue-950/5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4 sm:px-6 border-b border-slate-200/70 bg-gradient-to-r from-violet-50/70 via-white/70 to-rose-50/50">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white flex items-center justify-center shadow-lg shadow-blue-700/20">
            <History className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-semibold tracking-tight text-[#172554]">What changed</h2>
            <p className="text-xs text-[#52617B]">
              {delta.previousVersion == null ? 'Initial analysis baseline' : `Compared with v${delta.previousVersion}`} · Latest reasoning v{delta.currentVersion}
            </p>
          </div>
        </div>
        <button type="button" onClick={() => onSelectTab('evolution')} className="premium-control self-start sm:self-auto inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-violet-200 bg-white/85 text-xs font-semibold text-violet-800 hover:bg-white">
          Version history <ArrowRight className="size-3.5" />
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 divide-x divide-y divide-slate-200/70">
        {metrics.map((metric, index) => {
          const Icon = metric.icon;
          return (
            <button key={metric.label} type="button" onClick={() => onSelectTab(metric.tab)} className="premium-control min-h-24 p-3 sm:p-4 text-left hover:bg-white/70 focus-visible:z-10">
              <div className="flex items-center justify-between gap-2">
                <span className={`inline-flex size-7 items-center justify-center rounded-xl border ${toneClasses[metric.tone]}`}>
                  <Icon className="size-3.5" />
                </span>
                <motion.strong initial={reduceMotion ? false : { scale: 0.72, opacity: 0.5 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: reduceMotion ? 0 : 0.28, delay: reduceMotion ? 0 : index * 0.025 }} className="text-2xl font-semibold tabular-nums text-[#172554]">
                  {metric.value}
                </motion.strong>
              </div>
              <span className="mt-2 block text-[11px] sm:text-xs leading-tight text-[#52617B]">{metric.label}</span>
            </button>
          );
        })}
      </div>

      {changedItems.length > 0 ? (
        <div className="px-5 py-4 sm:px-6 border-t border-slate-200/70">
          <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-[#334155]">
            <Scale className="size-3.5 text-violet-600" />
            Latest changes in the record
          </div>
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
            {changedItems.map((item, index) => (
              <li key={`${item.ref || item.label}-${index}`} className="flex min-w-0 items-start gap-2 text-xs text-[#475569]">
                <span className={`mt-1 size-2 shrink-0 rounded-full ${item.tone === 'red' ? 'bg-rose-500' : item.tone === 'green' ? 'bg-emerald-500' : item.tone === 'amber' ? 'bg-amber-500' : 'bg-violet-500'}`} />
                <span className="min-w-0 line-clamp-2">{item.ref && <strong className="font-mono text-[#334155]">{item.ref} · </strong>}{item.label}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="px-5 py-3 sm:px-6 border-t border-slate-200/70 text-xs text-[#64748B]">
          No new case-state changes were recorded in this analysis version.
        </div>
      )}
    </section>
  );
};
