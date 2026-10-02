import React, { useState } from 'react';
import {
  UserCheck,
  AlertTriangle,
  FileQuestion,
  CheckCircle2,
  ShieldCheck,
  Clock,
  ArrowRight
} from 'lucide-react';
import { apiRequest } from '../../../lib/api.js';
import { formatDateTime } from '../../../lib/format.js';
import { EmptyState } from '../../../components/EmptyState.js';

interface HumanReviewTabProps {
  caseId: string;
  evidence: any[];
  conflicts: any[];
  latestAnalysis: any;
  isClosed: boolean;
  onRefresh: () => void;
  onOpenSourceViewer: (eid: string) => void;
  onSelectTab: (tab: string) => void;
}

export const HumanReviewTab: React.FC<HumanReviewTabProps> = ({
  caseId,
  evidence,
  conflicts,
  latestAnalysis,
  isClosed,
  onRefresh,
  onOpenSourceViewer,
  onSelectTab
}) => {
  const [signingOff, setSigningOff] = useState(false);
  const [signedSuccess, setSignedSuccess] = useState(false);
  const [signoffError, setSignoffError] = useState<string | null>(null);

  const challengedEvidence = evidence.filter(e => e.status === 'challenged');
  const openConflicts = conflicts.filter(c => c.status === 'open');
  const requiresAssessmentReview = latestAnalysis?.assessment_status === 'human_review_required' || latestAnalysis?.assessment_status === 'conflict_detected';

  const totalActionItems = challengedEvidence.length + openConflicts.length + (requiresAssessmentReview ? 1 : 0);

  const handleSignoff = async () => {
    if (isClosed) return;
    setSignoffError(null);
    setSigningOff(true);
    try {
      await apiRequest(`/api/cases/${caseId}/review/signoff`, { method: 'POST' });
      setSignedSuccess(true);
      onRefresh();
    } catch (err: any) {
      setSignoffError(err.message || 'Sign-off failed. Please try again.');
    } finally {
      setSigningOff(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Sign-off Banner & Accountability */}
      <div className="bg-white p-5 border border-[#E4DFD3] rounded card-brass-top flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-[#B08D57]" />
            <h2 className="text-sm font-semibold text-[#14213D]">
              Counsel Audit & Legal Accountability Sign-Off
            </h2>
          </div>
          <p className="text-xs text-[#5C5E66] mt-1 max-w-xl">
            Confirming review records an immutable timestamped audit trail attesting that qualified legal counsel has verified AI-assisted extractions, evaluated conflicts, and approved the evidence state.
          </p>
        </div>

        <div>
          {!isClosed ? (
            <button
              onClick={handleSignoff}
              disabled={signingOff}
              className="px-4 py-2 bg-[#14213D] hover:bg-[#1E2D4A] text-white text-xs font-semibold rounded shadow-sm transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-[#2F6B4F]" />
              <span>{signingOff ? 'Recording Sign-Off...' : 'Record Formal Case Review Sign-Off'}</span>
            </button>
          ) : (
            <span className="text-xs text-[#64748B] font-mono">Case Closed</span>
          )}
        </div>
      </div>

      {signoffError && <div role="alert" className="p-3 bg-[#FDF2F2] border border-[#F8B4B4] rounded text-sm text-[#9B2C2C]">{signoffError}</div>}

      {signedSuccess && (
        <div className="p-3 bg-[#F0FDF4] border border-[#BCF0DA] rounded text-xs text-[#2F6B4F] flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>Counsel review sign-off successfully recorded in timeline and audit log.</span>
        </div>
      )}

      {/* Review Queue Sections */}
      <div className="space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-[#E4DFD3]">
          <h3 className="text-sm font-semibold text-[#14213D]">
            Pending Human Review Action Items ({totalActionItems})
          </h3>
          <span className="text-xs text-[#5C5E66]">Requires legal discretion</span>
        </div>

        {totalActionItems === 0 ? (
          <EmptyState
            title="No pending review items."
            description="All active evidence extractions and consistency checks are verified or resolved."
            icon={CheckCircle2}
          />
        ) : (
          <div className="space-y-3">
            {/* Open Conflicts Queue */}
            {openConflicts.map(c => (
              <div key={c.id} className="p-4 bg-white border border-[#F8B4B4] rounded space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-[#9B2C2C] bg-[#FDF2F2] px-2 py-0.5 rounded border border-[#F8B4B4]">
                      {c.conflict_ref}
                    </span>
                    <span className="font-semibold text-[#14213D] capitalize">
                      {c.conflict_type.replace(/_/g, ' ')}
                    </span>
                    {c.severity && (
                      <span className="px-1.5 py-0.2 rounded bg-[#FDF2F2] text-[#9B2C2C] text-[10px] font-bold">
                        Severity: {c.severity}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => onSelectTab('conflicts')}
                    className="text-[#B08D57] hover:underline font-semibold inline-flex items-center gap-1"
                  >
                    <span>Inspect Conflict</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
                <p className="text-[#5C5E66]">{c.description}</p>
                <div className="text-[11px] text-[#5C5E66] italic">
                  Why it matters: {c.why_it_matters}
                </div>
              </div>
            ))}

            {/* Challenged Evidence Items */}
            {challengedEvidence.map(e => (
              <div key={e.id} className="p-4 bg-white border border-[#FCE96A] rounded space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-[#B7791F] bg-[#FEFCE8] px-2 py-0.5 rounded border border-[#FCE96A]">
                      {e.evidence_ref}
                    </span>
                    <span className="font-semibold text-[#14213D]">{e.fact_label}</span>
                  </div>
                  <button
                    onClick={() => onOpenSourceViewer(e.id)}
                    className="text-[#B08D57] hover:underline font-semibold inline-flex items-center gap-1"
                  >
                    <span>Review Extraction</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
                <p className="text-[#2B2D33]">{e.fact_text}</p>
                <div className="text-[11px] text-[#B7791F]">
                  Flag reason: {e.validation_notes || 'Low extraction confidence or scalar ambiguity.'}
                </div>
              </div>
            ))}

            {/* Assessment Review Flag */}
            {requiresAssessmentReview && (
              <div className="p-4 bg-white border border-[#E4DFD3] rounded space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-[#C2410C]">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span className="font-semibold text-sm">
                      Case Assessment Status: {latestAnalysis.assessment_status.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <button
                    onClick={() => onSelectTab('reasoning')}
                    className="text-[#B08D57] hover:underline font-semibold inline-flex items-center gap-1"
                  >
                    <span>View AI Reasoning</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
                <p className="text-[#5C5E66]">{latestAnalysis.summary_text}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
