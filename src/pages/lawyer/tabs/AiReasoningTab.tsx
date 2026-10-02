import React, { useState } from 'react';
import {
  Scale,
  CheckCircle2,
  AlertTriangle,
  FileQuestion,
  ExternalLink,
  ShieldCheck,
  Clock,
  Sparkles,
  ArrowRight
} from 'lucide-react';
import { EmptyState } from '../../../components/EmptyState.js';
import { AiDisclaimer } from '../../../components/AiDisclaimer.js';
import { formatDate, formatDateTime } from '../../../lib/format.js';
import { EvidenceStrengthBadge } from '../../../components/EvidenceStrengthBadge.js';
import { getEvidenceStrength } from '../../../lib/evidenceStrength.js';

interface AiReasoningTabProps {
  caseId: string;
  versions: any[];
  evidenceList: any[];
  onOpenSourceViewer: (eid: string) => void;
  onSelectTab: (tab: string) => void;
}

export const AiReasoningTab: React.FC<AiReasoningTabProps> = ({
  caseId,
  versions,
  evidenceList,
  onOpenSourceViewer,
  onSelectTab
}) => {
  const [selectedVersionNo, setSelectedVersionNo] = useState<number | null>(
    versions.length > 0 ? versions[0].version_no : null
  );

  if (versions.length === 0) {
    return (
      <div className="space-y-4">
        <EmptyState
          title="No evidence uploaded yet. Upload evidence to begin AI analysis."
          description="Upload case documents and execute the reconciliation pipeline to generate an auditable, cited reasoning trace."
          icon={Scale}
        />
        <AiDisclaimer />
      </div>
    );
  }

  const currentVersion =
    versions.find(v => v.version_no === selectedVersionNo) || versions[0];
  const deterministicMode = !currentVersion?.model_used || currentVersion.model_used === 'rule_engine';
  const engineLabel = deterministicMode ? 'Deterministic rules' : `${currentVersion.model_used} (recorded)`;
  const findings: any[] = currentVersion?.reasoning?.findings || [];
  const openQuestions: string[] = currentVersion?.reasoning?.open_questions || [];
  const findingCounts = findings.reduce((counts, finding) => {
    counts[finding.status] = (counts[finding.status] || 0) + 1;
    return counts;
  }, {} as Record<string, number>);
  const citedRefs = new Set<string>(findings.flatMap(finding => finding.evidence_refs || []));
  const citedEvidence = evidenceList.filter(item => citedRefs.has(item.evidence_ref) && item.confidence != null);
  const meanSourceConfidence = citedEvidence.length
    ? Math.round(citedEvidence.reduce((total, item) => total + Number(item.confidence), 0) / citedEvidence.length * 100)
    : null;
  const needsReviewCount = (findingCounts.contradicted || 0) + (findingCounts.unverified || 0) + (findingCounts.insufficient || 0);

  const resolveEvidenceId = (refStr: string) => {
    const item = evidenceList.find(e => e.evidence_ref === refStr);
    return item ? item.id : null;
  };

  return (
    <div className="space-y-5">
      {/* Version Selector Header */}
      <div className="bg-white p-4 sm:p-5 border border-[#E4DFD3] rounded-md shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 card-brass-top">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-[#14213D] flex items-center justify-center text-[#B08D57]">
            <Scale className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-[#14213D]">
              Auditable Evidence-Based Legal Reasoning
            </h2>
            <div className="flex items-center gap-2 text-xs text-[#5C5E66] mt-0.5">
              <span>Trigger: <strong className="text-[#14213D]">{currentVersion.trigger.replace(/_/g, ' ')}</strong></span>
              <span>·</span>
              <span className="font-mono">Engine: {engineLabel}</span>
              <span>·</span>
              <span>{formatDateTime(currentVersion.created_at)}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs text-[#5C5E66] font-medium">Analysis Version:</label>
          <select
            value={selectedVersionNo || versions[0]?.version_no}
            onChange={e => setSelectedVersionNo(Number(e.target.value))}
            className="px-2.5 py-1 text-xs border border-[#E4DFD3] rounded bg-white font-mono focus:outline-none focus:border-[#14213D]"
          >
            {versions.map(v => (
              <option key={v.version_no} value={v.version_no}>
                Version v{v.version_no} ({v.assessment_status.replace(/_/g, ' ')})
              </option>
            ))}
          </select>
        </div>
      </div>

      {deterministicMode && (
        <div role="status" className="flex items-start gap-3 p-4 bg-[#EAF5F3] border border-[#B7DCD7] rounded-md text-sm text-[#176B68]">
          <ShieldCheck className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <strong>Deterministic analysis active</strong>
            <p className="mt-0.5 text-xs text-[#2B5F5D]">This assessment uses grounded evidence, exact source quotes, and explicit conflict rules. The workflow remains available without an external AI response.</p>
          </div>
        </div>
      )}

      {!deterministicMode && (
        <div role="status" className="flex items-start gap-3 p-4 bg-[#FEFCE8] border border-[#FCE96A] rounded-md text-sm text-[#7A5100]">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <strong>Saved model attribution</strong>
            <p className="mt-0.5 text-xs">This version records {currentVersion.model_used}. A saved model name does not verify current service connectivity; fresh analyses automatically use deterministic rules if the external service is unavailable.</p>
          </div>
        </div>
      )}

      <section aria-label="Analysis decision summary" className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <div className="bg-white border border-[#E4DFD3] rounded-md p-4">
          <span className="text-[11px] uppercase tracking-wide text-[#5C5E66]">Findings</span>
          <strong className="mt-1 block text-2xl font-mono text-[#14213D]">{findings.length}</strong>
          <span className="text-xs text-[#5C5E66]">in this assessment</span>
        </div>
        <div className="bg-white border border-[#BCF0DA] rounded-md p-4">
          <span className="text-[11px] uppercase tracking-wide text-[#2F6B4F]">Supported</span>
          <strong className="mt-1 block text-2xl font-mono text-[#2F6B4F]">{findingCounts.supported || 0}</strong>
          <span className="text-xs text-[#5C5E66]">with cited evidence</span>
        </div>
        <div className="bg-white border border-[#F8B4B4] rounded-md p-4">
          <span className="text-[11px] uppercase tracking-wide text-[#9B2C2C]">Needs attention</span>
          <strong className="mt-1 block text-2xl font-mono text-[#9B2C2C]">{needsReviewCount}</strong>
          <span className="text-xs text-[#5C5E66]">contradicted or unresolved</span>
        </div>
        <div className="bg-white border border-[#B7DCD7] rounded-md p-4">
          <span className="text-[11px] uppercase tracking-wide text-[#176B68]">Source confidence</span>
          <strong className="mt-1 block text-2xl font-mono text-[#176B68]">{meanSourceConfidence == null ? '—' : `${meanSourceConfidence}%`}</strong>
          <span className="text-xs text-[#5C5E66]">mean of cited extraction scores</span>
          {meanSourceConfidence != null && <div className="h-1.5 mt-2 rounded-full bg-[#EAF5F3] overflow-hidden" role="meter" aria-label="Mean cited source confidence" aria-valuemin={0} aria-valuemax={100} aria-valuenow={meanSourceConfidence}><div className="h-full bg-[#176B68]" style={{ width: `${meanSourceConfidence}%` }} /></div>}
        </div>
      </section>

      {/* Assessment Summary */}
      <div className="p-5 sm:p-6 bg-[#14213D] text-white rounded-md shadow-sm space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] uppercase tracking-wider text-[#B7DCD7] font-semibold">{deterministicMode ? 'Deterministic case assessment' : 'AI-assisted assessment'}</span>
          <span className="px-2 py-0.5 rounded bg-white/10 text-xs font-mono text-white/90">{currentVersion.assessment_status.replace(/_/g, ' ')}</span>
          {needsReviewCount > 0 && <span className="px-2 py-0.5 rounded bg-[#FDF2F2] text-[#9B2C2C] text-xs font-semibold">Human attention recommended</span>}
        </div>
        <p className="font-legal-heading text-lg sm:text-xl leading-relaxed text-white">
          {currentVersion.summary_text}
        </p>
      </div>

      {/* Findings Trace */}
      <div className="space-y-4">
        <div className="flex items-center justify-between pb-1 border-b border-[#E4DFD3]">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[#5C5E66]">
            Structured Findings ({findings.length})
          </h3>
          <span className="text-xs text-[#5C5E66]">Every conclusion cites active evidence references</span>
        </div>

        {findings.length === 0 ? (
          <div className="p-6 bg-white border border-[#E4DFD3] rounded text-center text-xs text-[#5C5E66]">
            Unable to establish findings from the available evidence.
          </div>
        ) : (
          findings.map((f, i) => {
            const isContradicted = f.status === 'contradicted';
            const isUnverified = f.status === 'unverified';
            const isSupported = f.status === 'supported';
            const isInsufficient = f.status === 'insufficient';

            return (
              <div
                key={f.finding_id || i}
                className={`p-4 bg-white border rounded space-y-3 transition-colors ${
                  isContradicted
                    ? 'border-[#F8B4B4]'
                    : isUnverified
                    ? 'border-[#FCE96A]'
                    : 'border-[#E4DFD3]'
                }`}
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-[#14213D] px-2 py-0.5 bg-[#FAF7F0] border border-[#E4DFD3] rounded">
                      {f.finding_id}
                    </span>
                    <h4 className="text-xs font-bold text-[#2B2D33] leading-relaxed">
                      {f.statement}
                    </h4>
                  </div>

                  <span
                    className={`text-[10px] font-mono px-2 py-0.5 rounded uppercase font-semibold shrink-0 ${
                      isContradicted
                        ? 'bg-[#FDF2F2] text-[#9B2C2C] border border-[#F8B4B4]'
                        : isUnverified
                        ? 'bg-[#FEFCE8] text-[#B7791F] border border-[#FCE96A]'
                        : isSupported
                        ? 'bg-[#F0FDF4] text-[#2F6B4F] border border-[#BCF0DA]'
                        : 'bg-[#F1F5F9] text-[#475569]'
                    }`}
                  >
                    {f.status}
                  </span>
                  <EvidenceStrengthBadge
                    compact
                    strength={getEvidenceStrength({
                      evidence_ref: f.evidence_refs?.[0],
                      status: 'active',
                      source_quote: f.evidence_refs?.length ? 'cited evidence' : ''
                    }, [f])}
                  />
                </div>

                {/* Evidence Citing Bar */}
                <div className="p-2.5 bg-[#FAF7F0] border border-[#E4DFD3] rounded text-xs grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <span className="text-[11px] text-[#5C5E66] block mb-1">Evidence Considered:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {(!f.evidence_refs || f.evidence_refs.length === 0) ? (
                        <span className="text-[#5C5E66] italic">Insufficient evidence</span>
                      ) : (
                        f.evidence_refs.map((ref: string) => {
                          const eid = resolveEvidenceId(ref);
                          return (
                            <button
                              key={ref}
                              onClick={() => eid && onOpenSourceViewer(eid)}
                              className="font-mono text-[11px] font-bold px-2 py-0.5 rounded bg-white text-[#14213D] border border-[#E4DFD3] hover:border-[#14213D] inline-flex items-center gap-1 transition-colors"
                            >
                              <span>{ref}</span>
                              <ExternalLink className="w-3 h-3 text-[#B08D57]" />
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>

                  <div>
                    <span className="text-[11px] text-[#5C5E66] block mb-1">Rule or Legal Fact Applied:</span>
                    <span className="text-[#2B2D33] font-medium text-[11px] block">{f.rule_or_fact_applied}</span>
                  </div>
                </div>

                {/* Cross References & Impact */}
                <div className="text-xs space-y-1.5 pt-1">
                  {f.conflict_refs && f.conflict_refs.length > 0 && (
                    <div className="flex items-center gap-2 text-[#9B2C2C]">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      <span>Associated Inconsistencies:</span>
                      {f.conflict_refs.map((cr: string) => (
                        <span key={cr} className="font-mono font-bold px-1.5 py-0.2 bg-[#FDF2F2] rounded border border-[#F8B4B4]">
                          {cr}
                        </span>
                      ))}
                    </div>
                  )}

                  {f.missing_refs && f.missing_refs.length > 0 && (
                    <div className="flex items-center gap-2 text-[#B7791F]">
                      <FileQuestion className="w-3.5 h-3.5 shrink-0" />
                      <span>Pending Corroboration:</span>
                      {f.missing_refs.map((mr: string) => (
                        <span key={mr} className="font-mono font-bold px-1.5 py-0.2 bg-[#FEFCE8] rounded border border-[#FCE96A]">
                          {mr}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="pt-1 border-t border-[#E4DFD3]/60 text-[11px] flex justify-between items-center text-[#5C5E66]">
                    <span><strong>Legal Impact:</strong> {f.impact}</span>
                    {isContradicted && (
                      <button
                        onClick={() => onSelectTab('review')}
                        className="text-[#9B2C2C] hover:underline font-semibold inline-flex items-center gap-1"
                      >
                        <span>Human review required</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Open Questions */}
      {openQuestions.length > 0 && (
        <div className="p-4 bg-white border border-[#E4DFD3] rounded space-y-2">
          <span className="text-xs font-semibold text-[#14213D] block">
            Open Matters That Could Not Be Established From Current Evidence:
          </span>
          <ul className="list-disc list-inside text-xs text-[#5C5E66] space-y-1">
            {openQuestions.map((q, idx) => (
              <li key={idx}>{q}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Disclaimer */}
      <AiDisclaimer />
    </div>
  );
};
