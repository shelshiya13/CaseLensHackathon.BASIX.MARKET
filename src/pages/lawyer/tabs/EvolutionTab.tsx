import React, { useState } from 'react';
import {
  History,
  GitCommit,
  GitCompare,
  Cpu,
  Database,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';
import { apiRequest } from '../../../lib/api.js';
import { formatDateTime } from '../../../lib/format.js';
import { EmptyState } from '../../../components/EmptyState.js';

interface EvolutionTabProps {
  caseId: string;
  versions: any[];
  agentState: any;
  onRefresh: () => void;
}

export const EvolutionTab: React.FC<EvolutionTabProps> = ({
  caseId,
  versions,
  agentState,
  onRefresh
}) => {
  const [compareA, setCompareA] = useState<number>(versions[0]?.version_no || 1);
  const [compareB, setCompareB] = useState<number>(versions[1]?.version_no || 1);
  const [compareResult, setCompareResult] = useState<any | null>(null);
  const [loadingCompare, setLoadingCompare] = useState(false);

  const handleCompare = async () => {
    if (compareA === compareB) return;
    setLoadingCompare(true);
    try {
      const res = await apiRequest(`/api/cases/${caseId}/analysis/compare?a=${compareA}&b=${compareB}`);
      setCompareResult(res);
    } catch (err: any) {
      alert(err.message || 'Comparison failed');
    } finally {
      setLoadingCompare(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Agent Memory & Persistent Continuity Banner (§6.3) */}
      <div className="bg-white p-5 border border-[#E4DFD3] rounded card-brass-top">
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-[#E4DFD3]">
          <div className="flex items-center gap-2.5">
            <Cpu className="w-5 h-5 text-[#B08D57]" />
            <div>
              <h2 className="text-sm font-semibold text-[#14213D]">
                Shared Case Record
              </h2>
              <span className="text-xs text-[#5C5E66]">
                Evidence-backed case history, updated as the record evolves
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
          <div className="p-2.5 bg-[#FAF7F0] rounded border border-[#E4DFD3]">
            <span className="text-[#5C5E66] block text-[10px] uppercase">Documents Known</span>
            <span className="font-mono font-bold text-base text-[#14213D]">
              {agentState?.documents?.length || 0}
            </span>
          </div>

          <div className="p-2.5 bg-[#FAF7F0] rounded border border-[#E4DFD3]">
            <span className="text-[#5C5E66] block text-[10px] uppercase">Evidence Ingested</span>
            <span className="font-mono font-bold text-base text-[#14213D]">
              {agentState?.evidence?.length || 0}
            </span>
          </div>

          <div className="p-2.5 bg-[#FAF7F0] rounded border border-[#E4DFD3]">
            <span className="text-[#5C5E66] block text-[10px] uppercase">Open Inconsistencies</span>
            <span className="font-mono font-bold text-base text-[#9B2C2C]">
              {agentState?.conflicts?.filter((c: any) => c.status === 'open').length || 0}
            </span>
          </div>

          <div className="p-2.5 bg-[#FAF7F0] rounded border border-[#E4DFD3]">
            <span className="text-[#5C5E66] block text-[10px] uppercase">Human Corrections</span>
            <span className="font-mono font-bold text-base text-[#B08D57]">
              {agentState?.humanCorrections?.length || 0}
            </span>
          </div>

          <div className="p-2.5 bg-[#FAF7F0] rounded border border-[#E4DFD3]">
            <span className="text-[#5C5E66] block text-[10px] uppercase">Latest Assessment</span>
            <span className="font-mono font-bold text-base text-[#2F6B4F]">
              v{agentState?.currentAssessment?.versionNo || 0}
            </span>
          </div>
        </div>

        <p className="mt-3 text-[11px] text-[#5C5E66] leading-relaxed">
          <strong>Borderless Continuity:</strong> The agent does not restart reasoning from zero. When new documents arrive or corrections are made, it retrieves this persistent snapshot, ingests the delta, and explains specifically what shifted in its legal assessment.
        </p>
      </div>

      {/* Version History Stream */}
      <div className="bg-white p-5 border border-[#E4DFD3] rounded space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-[#E4DFD3]">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-[#B08D57]" />
            <h3 className="text-sm font-semibold text-[#14213D]">
              Append-Only Case Evolution Ledger ({versions.length} versions)
            </h3>
          </div>
          <span className="text-xs text-[#5C5E66]">Immutable historical assessments</span>
        </div>

        {versions.length === 0 ? (
          <EmptyState
            title="No analysis versions generated yet."
            description="Process documents or run manual analysis to generate immutable reasoning snapshots."
            icon={History}
          />
        ) : (
          <div className="space-y-4">
            {versions.map((v, index) => {
              const isLatest = index === 0;
              const diffItems: any[] = v.state_diff || [];

              return (
                <div
                  key={v.id}
                  className={`p-4 rounded border ${
                    isLatest ? 'border-[#14213D] bg-white card-brass-top' : 'border-[#E4DFD3] bg-[#FAF7F0]/40'
                  }`}
                >
                  <div className="flex items-center justify-between pb-2 border-b border-[#E4DFD3] text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-[#14213D] px-2 py-0.5 rounded bg-[#FAF7F0] border border-[#E4DFD3]">
                        Version v{v.version_no}
                      </span>
                      <span className="font-semibold text-[#2B2D33] capitalize">
                        {v.trigger.replace(/_/g, ' ')} {v.trigger_ref && `— ${v.trigger_ref}`}
                      </span>
                      {isLatest && (
                        <span className="px-2 py-0.2 rounded bg-[#F0FDF4] text-[#2F6B4F] text-[10px] font-bold">
                          CURRENT ACTIVE
                        </span>
                      )}
                    </div>
                    <span className="text-[#5C5E66] font-mono text-[11px]">
                      {formatDateTime(v.created_at)}
                    </span>
                  </div>

                  <div className="mt-3 text-xs space-y-2">
                    <p className="text-[#2B2D33] leading-relaxed font-medium bg-[#FAF7F0] p-2.5 rounded border border-[#E4DFD3]">
                      {v.summary_text}
                    </p>

                    {/* Diff view: What changed in understanding and why */}
                    {diffItems.length > 0 && (
                      <div className="p-3 bg-[#FEFCE8] border border-[#FCE96A] rounded space-y-1.5">
                        <span className="font-bold text-[11px] text-[#B7791F] block uppercase tracking-wider">
                          Evolution Delta (What Changed & Why):
                        </span>
                        {diffItems.map((d, di) => (
                          <div key={di} className="text-xs text-[#2B2D33] space-y-0.5">
                            {d.was && (
                              <div className="text-[#5C5E66] text-[11px]">
                                <strong>Prior understanding:</strong> {d.was}
                              </div>
                            )}
                            <div className="font-medium text-[#14213D]">
                              <strong>Revised assessment:</strong> {d.now}
                            </div>
                            <div className="text-[#B7791F] font-semibold text-[11px]">
                              Reason: {d.because}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Two-Version Comparator */}
      {versions.length > 1 && (
        <div className="bg-white p-5 border border-[#E4DFD3] rounded space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-[#E4DFD3]">
            <GitCompare className="w-4 h-4 text-[#B08D57]" />
            <h3 className="text-sm font-semibold text-[#14213D]">Compare Two Reasoning Versions</h3>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span>Compare Version:</span>
            <select
              value={compareA}
              onChange={e => setCompareA(Number(e.target.value))}
              className="px-2 py-1 border border-[#E4DFD3] rounded bg-white font-mono"
            >
              {versions.map(v => (
                <option key={v.version_no} value={v.version_no}>v{v.version_no}</option>
              ))}
            </select>
            <span>with</span>
            <select
              value={compareB}
              onChange={e => setCompareB(Number(e.target.value))}
              className="px-2 py-1 border border-[#E4DFD3] rounded bg-white font-mono"
            >
              {versions.map(v => (
                <option key={v.version_no} value={v.version_no}>v{v.version_no}</option>
              ))}
            </select>
            <button
              onClick={handleCompare}
              disabled={loadingCompare || compareA === compareB}
              className="px-3 py-1 bg-[#14213D] text-white rounded font-medium hover:bg-[#1E2D4A] transition-colors disabled:opacity-50"
            >
              {loadingCompare ? 'Comparing...' : 'Compare Versions'}
            </button>
          </div>

          {compareResult && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs pt-3 border-t border-[#E4DFD3]">
              <div className="p-3 bg-[#FAF7F0] border border-[#E4DFD3] rounded space-y-2">
                <span className="font-mono font-bold text-[#14213D]">Version v{compareResult.versionA.version_no}</span>
                <p className="text-[#2B2D33]">{compareResult.versionA.summary_text}</p>
                <div className="text-[11px] text-[#5C5E66]">
                  Status: <strong>{compareResult.versionA.assessment_status}</strong>
                </div>
              </div>

              <div className="p-3 bg-[#FAF7F0] border border-[#E4DFD3] rounded space-y-2">
                <span className="font-mono font-bold text-[#14213D]">Version v{compareResult.versionB.version_no}</span>
                <p className="text-[#2B2D33]">{compareResult.versionB.summary_text}</p>
                <div className="text-[11px] text-[#5C5E66]">
                  Status: <strong>{compareResult.versionB.assessment_status}</strong>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
