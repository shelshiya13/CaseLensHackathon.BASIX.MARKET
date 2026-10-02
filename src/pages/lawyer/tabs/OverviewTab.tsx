import React from 'react';
import {
  FileText,
  AlertTriangle,
  FileQuestion,
  UserCheck,
  Calendar,
  Clock,
  Landmark,
  Scale,
  Play,
  Upload,
  Lock,
  ArrowRight
} from 'lucide-react';
import { StatusBadge } from '../../../components/StatusBadge.js';
import { EmptyState } from '../../../components/EmptyState.js';
import { formatDate, formatDateTime } from '../../../lib/format.js';

interface OverviewTabProps {
  caseData: any;
  parties: any[];
  counts: { documents: number; evidence: number; conflicts: number; missing: number };
  latestAnalysis: any;
  onSelectTab: (tab: string) => void;
  onRunAnalysis: () => void;
  onCloseCase: () => void;
  onReopenCase: () => void;
  analysisRunning: boolean;
}

export const OverviewTab: React.FC<OverviewTabProps> = ({
  caseData,
  parties,
  counts,
  latestAnalysis,
  onSelectTab,
  onRunAnalysis,
  onCloseCase,
  onReopenCase,
  analysisRunning
}) => {
  const isClosed = Boolean(caseData.closed_at);

  return (
    <div className="space-y-6">
      {/* Top Overview Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <button
          type="button"
          onClick={() => onSelectTab('documents')}
          className="w-full text-left p-4 bg-white border border-[#E4DFD3] rounded-md shadow-sm hover:border-[#14213D] hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-[#176B68] card-brass-top"
        >
          <div className="flex items-center justify-between text-xs text-[#5C5E66]">
            <span>Documents</span>
            <FileText className="w-4 h-4 text-[#14213D]" />
          </div>
          <div className="mt-2 text-2xl font-mono font-bold text-[#14213D]">{counts.documents}</div>
          <div className="text-[11px] text-[#5C5E66] mt-1">Uploaded & scanned records</div>
        </button>

        <button
          type="button"
          onClick={() => onSelectTab('evidence')}
          className="w-full text-left p-4 bg-white border border-[#E4DFD3] rounded-md shadow-sm hover:border-[#14213D] hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-[#176B68] card-brass-top"
        >
          <div className="flex items-center justify-between text-xs text-[#5C5E66]">
            <span>Active Evidence</span>
            <Scale className="w-4 h-4 text-[#B08D57]" />
          </div>
          <div className="mt-2 text-2xl font-mono font-bold text-[#14213D]">{counts.evidence}</div>
          <div className="text-[11px] text-[#5C5E66] mt-1">Grounded verified facts</div>
        </button>

        <button
          type="button"
          onClick={() => onSelectTab('conflicts')}
          className="w-full text-left p-4 bg-white border border-[#E4DFD3] rounded-md shadow-sm hover:border-[#9B2C2C] hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-[#176B68] card-brass-top"
        >
          <div className="flex items-center justify-between text-xs text-[#9B2C2C]">
            <span>Detected Conflicts</span>
            <AlertTriangle className="w-4 h-4 text-[#9B2C2C]" />
          </div>
          <div className="mt-2 text-2xl font-mono font-bold text-[#9B2C2C]">{counts.conflicts}</div>
          <div className="text-[11px] text-[#5C5E66] mt-1">Rule-derived discrepancies</div>
        </button>

        <button
          type="button"
          onClick={() => onSelectTab('missing')}
          className="w-full text-left p-4 bg-white border border-[#E4DFD3] rounded-md shadow-sm hover:border-[#B7791F] hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-[#176B68] card-brass-top"
        >
          <div className="flex items-center justify-between text-xs text-[#B7791F]">
            <span>Missing Evidence</span>
            <FileQuestion className="w-4 h-4 text-[#B7791F]" />
          </div>
          <div className="mt-2 text-2xl font-mono font-bold text-[#B7791F]">{counts.missing}</div>
          <div className="text-[11px] text-[#5C5E66] mt-1">Pending corroboration</div>
        </button>
      </div>

      {/* Main Row: Assessment Card & Metadata */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Latest AI-Assisted Assessment */}
        <div className="lg:col-span-2 bg-white border border-[#E4DFD3] rounded-md shadow-sm p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#E4DFD3]">
            <div className="flex items-center gap-2">
              <Scale className="w-4 h-4 text-[#B08D57]" />
              <h2 className="text-sm font-semibold text-[#14213D]">Current Legal Assessment</h2>
            </div>
            {latestAnalysis && (
              <span className="font-mono text-xs px-2 py-0.5 rounded bg-[#FAF7F0] border border-[#E4DFD3] text-[#5C5E66]">
                Version v{latestAnalysis.version_no}
              </span>
            )}
          </div>

          {!latestAnalysis ? (
            <EmptyState
              title="No evidence uploaded yet. Upload evidence to begin AI analysis."
              description="Upload contractual agreements, tax invoices, or transaction receipts to trigger the grounded evidence extraction pipeline."
              icon={Scale}
              actionLabel={counts.evidence > 0 ? 'Run analysis' : 'Upload Evidence Document'}
              onAction={counts.evidence > 0 ? onRunAnalysis : () => onSelectTab('documents')}
            />
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <StatusBadge status={caseData.status} />
                <span className="text-xs text-[#5C5E66] font-mono">
                  Synthesized {formatDateTime(latestAnalysis.created_at)}
                </span>
              </div>

              <div className="relative overflow-hidden p-5 sm:p-6 bg-[#EAF5F3] border border-[#B7DCD7] rounded-md">
                <div className="flex items-center gap-2 mb-3 text-[11px] font-semibold uppercase tracking-wider text-[#176B68]">
                  <span className="w-2 h-2 rounded-full bg-[#176B68]" />
                  <span>AI-assisted assessment</span>
                  <span className="ml-auto font-mono normal-case tracking-normal text-[#5C5E66]">Version {latestAnalysis.version_no}</span>
                </div>
                <p className="text-sm sm:text-base leading-relaxed text-[#14213D] font-medium">
                  {latestAnalysis.summary_text}
                </p>
              </div>

              <div className="flex items-center justify-between pt-2 text-xs">
                <button
                  onClick={() => onSelectTab('reasoning')}
                  className="text-[#14213D] hover:underline font-semibold inline-flex items-center gap-1.5"
                >
                  <span>Examine auditable evidence findings</span>
                  <ArrowRight className="w-3.5 h-3.5 text-[#B08D57]" />
                </button>

                <button
                  onClick={onRunAnalysis}
                  disabled={analysisRunning || isClosed}
                  className="px-3 py-1 bg-[#14213D] text-white rounded text-xs hover:bg-[#1E2D4A] transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
                >
                  <Play className="w-3 h-3 text-[#B08D57]" />
                  <span>{analysisRunning ? 'Evaluating...' : 'Re-run analysis'}</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Matter Details & Quick Actions */}
        <div className="bg-white border border-[#E4DFD3] rounded p-5 space-y-4 flex flex-col justify-between">
          <div>
            <h2 className="text-sm font-semibold text-[#14213D] pb-2 border-b border-[#E4DFD3]">
              Matter Particulars
            </h2>

            <div className="space-y-3 pt-2 text-xs">
              <div className="flex justify-between">
                <span className="text-[#5C5E66]">Matter Type:</span>
                <span className="font-medium text-[#2B2D33]">{caseData.case_type}</span>
              </div>

              <div className="flex justify-between">
                <span className="text-[#5C5E66]">Court / Forum:</span>
                <span className="font-medium text-[#2B2D33]">{caseData.court || '—'}</span>
              </div>

              <div className="flex justify-between">
                <span className="text-[#5C5E66]">Case Number:</span>
                <span className="font-mono text-[#2B2D33]">{caseData.case_number || '—'}</span>
              </div>

              <div className="flex justify-between">
                <span className="text-[#5C5E66]">Next Hearing:</span>
                <span className="font-medium text-[#14213D]">
                  {caseData.next_hearing_at ? formatDate(caseData.next_hearing_at) : 'No upcoming hearings'}
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-[#5C5E66]">Lead Counsel:</span>
                <span className="font-medium text-[#2B2D33]">{caseData.assigned_lawyer_name}</span>
              </div>

              <div className="pt-2 border-t border-[#E4DFD3]">
                <span className="text-[#5C5E66] block mb-1.5 font-medium">Parties to Suit:</span>
                <div className="space-y-1">
                  {parties.length === 0 ? (
                    <span className="text-[#5C5E66] italic">No parties recorded</span>
                  ) : (
                    parties.map(p => (
                      <div key={p.id} className="flex justify-between text-[11px] p-1.5 bg-[#FAF7F0] rounded border border-[#E4DFD3]">
                        <span className="font-medium text-[#2B2D33]">{p.name}</span>
                        <span className="uppercase text-[10px] text-[#5C5E66] font-mono">({p.party_role})</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-[#E4DFD3] space-y-2">
            {!isClosed ? (
              <button
                onClick={onCloseCase}
                className="w-full py-1.5 px-3 border border-[#E4DFD3] hover:bg-[#FDF2F2] hover:border-[#F8B4B4] hover:text-[#9B2C2C] text-[#5C5E66] rounded text-xs font-medium transition-colors flex items-center justify-center gap-1.5"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Close Case Matter</span>
              </button>
            ) : (
              <div className="space-y-2">
                <div className="text-center p-2 bg-[#F1F5F9] rounded text-xs text-[#64748B] font-medium">
                  Case Closed (Read-Only Mode)
                </div>
                <button
                  type="button"
                  onClick={onReopenCase}
                  className="w-full py-2 px-3 bg-[#14213D] hover:bg-[#1E2D4A] text-white rounded text-xs font-semibold transition-colors"
                >
                  Reopen Case Matter
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
