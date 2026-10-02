import React, { useState, useEffect } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import {
  Scale,
  Briefcase,
  FileText,
  AlertTriangle,
  FileQuestion,
  Cpu,
  History,
  Clock,
  UserCheck,
  Settings,
  ArrowLeft,
  Play,
  Lock,
  Loader2,
  Calendar,
  RotateCcw,
  Languages,
  Users,
  ShieldCheck,
  ScanText,
  Sparkles
} from 'lucide-react';
import { apiRequest } from '../../lib/api.js';
import { StatusBadge } from '../../components/StatusBadge.js';
import { DemoBadge } from '../../components/DemoBadge.js';
import { formatDate } from '../../lib/format.js';
import { SourceViewerModal } from '../../components/SourceViewerModal.js';
import { WhatChangedPanel } from '../../components/WhatChangedPanel.js';
import { deriveAnalysisDelta } from '../../lib/analysisDelta.js';

// Tabs
import { OverviewTab } from './tabs/OverviewTab.js';
import { LanguagesTab } from './tabs/LanguagesTab.js';
import { EntitiesTab } from './tabs/EntitiesTab.js';
import { GuardianSummaryTab, OcrTab } from './tabs/GuardianOcrTabs.js';
import { EvidenceTab } from './tabs/EvidenceTab.js';
import { ConflictsTab } from './tabs/ConflictsTab.js';
import { MissingEvidenceTab } from './tabs/MissingEvidenceTab.js';
import { AiReasoningTab } from './tabs/AiReasoningTab.js';
import { TimelineTab } from './tabs/TimelineTab.js';
import { EvolutionTab } from './tabs/EvolutionTab.js';
import { DocumentsTab } from './tabs/DocumentsTab.js';
import { HumanReviewTab } from './tabs/HumanReviewTab.js';
import { CaseDetailsTab } from './tabs/CaseDetailsTab.js';
import { AskTheCaseTab } from './tabs/AskTheCaseTab.js';
import { AiAgentsTab } from './tabs/AiAgentsTab.js';

export const CaseWorkspace: React.FC = () => {
  const { id: caseId } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const currentTab = searchParams.get('tab') || 'overview';

  const [caseData, setCaseData] = useState<any | null>(null);
  const [parties, setParties] = useState<any[]>([]);
  const [counts, setCounts] = useState({ documents: 0, evidence: 0, conflicts: 0, missing: 0 });
  const [latestAnalysis, setLatestAnalysis] = useState<any | null>(null);

  // Tab specific data
  const [documents, setDocuments] = useState<any[]>([]);
  const [evidence, setEvidence] = useState<any[]>([]);
  const [conflicts, setConflicts] = useState<any[]>([]);
  const [missingEvidence, setMissingEvidence] = useState<any[]>([]);
  const [versions, setVersions] = useState<any[]>([]);
  const [timeline, setTimeline] = useState<{ activityEvents: any[]; documentDatedEvents: any[] }>({
    activityEvents: [],
    documentDatedEvents: []
  });
  const [agentState, setAgentState] = useState<any | null>(null);

  const [loading, setLoading] = useState(true);
  const [analysisRunning, setAnalysisRunning] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [closeReason, setCloseReason] = useState('');
  const [closing, setClosing] = useState(false);
  const [reopenDialogOpen, setReopenDialogOpen] = useState(false);
  const [reopenReason, setReopenReason] = useState('');
  const [reopening, setReopening] = useState(false);

  // Source Viewer Modal
  const [sourceViewerEid, setSourceViewerEid] = useState<string | null>(null);
  const [sourceViewerDocId, setSourceViewerDocId] = useState<string | null>(null);

  const fetchCaseCore = async () => {
    if (!caseId) return;
    try {
      const res = await apiRequest(`/api/cases/${caseId}`);
      setCaseData(res.case);
      setParties(res.parties || []);
      setCounts(res.counts || { documents: 0, evidence: 0, conflicts: 0, missing: 0 });
      setLatestAnalysis(res.latestAnalysis);
    } catch (err) {
      console.error('Failed to load case data:', err);
      setLoadError(err instanceof Error ? err.message : 'Unable to load this case.');
    }
  };

  const fetchTabData = async () => {
    if (!caseId) return;
    try {
      if (currentTab === 'overview' || currentTab === 'documents' || currentTab === 'languages' || currentTab === 'ocr') {
        const dRes = await apiRequest(`/api/cases/${caseId}/documents`);
        setDocuments(dRes.documents || []);
      }
      if (currentTab === 'overview' || currentTab === 'evidence' || currentTab === 'reasoning' || currentTab === 'review' || currentTab === 'languages') {
        const eRes = await apiRequest(`/api/cases/${caseId}/evidence`);
        setEvidence(eRes.evidence || []);
      }
      if (currentTab === 'overview' || currentTab === 'conflicts' || currentTab === 'review') {
        const cRes = await apiRequest(`/api/cases/${caseId}/conflicts`);
        setConflicts(cRes.conflicts || []);
      }
      if (currentTab === 'overview' || currentTab === 'missing' || currentTab === 'review') {
        const mRes = await apiRequest(`/api/cases/${caseId}/missing-evidence`);
        setMissingEvidence(mRes.missingEvidence || []);
      }
      if (currentTab === 'overview' || currentTab === 'evidence' || currentTab === 'documents' || currentTab === 'reasoning' || currentTab === 'evolution') {
        const vRes = await apiRequest(`/api/cases/${caseId}/analysis/versions`);
        setVersions(vRes.versions || []);
      }
      if (currentTab === 'timeline' || currentTab === 'overview' || currentTab === 'documents' || currentTab === 'reasoning') {
        const tRes = await apiRequest(`/api/cases/${caseId}/timeline`);
        setTimeline(tRes);
      }
      if (currentTab === 'evolution') {
        const sRes = await apiRequest(`/api/cases/${caseId}/agent-state`);
        setAgentState(sRes.caseState);
      }
    } catch (err) {
      console.error('Failed to fetch tab data:', err);
      setLoadError(err instanceof Error ? err.message : 'Unable to load this case view.');
    }
  };

  const refreshCurrentTab = async () => {
    await Promise.all([fetchCaseCore(), fetchTabData()]);
  };

  const refreshAfterProcessing = async () => {
    if (!caseId) return;
    try {
      const [caseRes, docRes, evidenceRes, conflictRes, missingRes, versionRes, timelineRes] = await Promise.all([
        apiRequest(`/api/cases/${caseId}`),
        apiRequest(`/api/cases/${caseId}/documents`),
        apiRequest(`/api/cases/${caseId}/evidence`),
        apiRequest(`/api/cases/${caseId}/conflicts`),
        apiRequest(`/api/cases/${caseId}/missing-evidence`),
        apiRequest(`/api/cases/${caseId}/analysis/versions`),
        apiRequest(`/api/cases/${caseId}/timeline`)
      ]);
      setCaseData(caseRes.case);
      setParties(caseRes.parties || []);
      setCounts(caseRes.counts || { documents: 0, evidence: 0, conflicts: 0, missing: 0 });
      setLatestAnalysis(caseRes.latestAnalysis);
      setDocuments(docRes.documents || []);
      setEvidence(evidenceRes.evidence || []);
      setConflicts(conflictRes.conflicts || []);
      setMissingEvidence(missingRes.missingEvidence || []);
      setVersions(versionRes.versions || []);
      setTimeline(timelineRes);
    } catch (err) {
      console.error('Failed to refresh case data after document processing:', err);
    }
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await fetchCaseCore();
      await fetchTabData();
      setLoading(false);
    };
    init();
  }, [caseId, currentTab]);

  const handleTabChange = (tabKey: string) => {
    setSearchParams({ tab: tabKey });
  };

  const handleTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const currentIndex = tabs.findIndex(tab => tab.key === currentTab);
    let nextIndex = currentIndex;
    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % tabs.length;
    if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = tabs.length - 1;
    if (nextIndex !== currentIndex) {
      event.preventDefault();
      handleTabChange(tabs[nextIndex].key);
      document.getElementById(`case-tab-${tabs[nextIndex].key}`)?.focus();
    }
  };

  const handleRunAnalysis = async () => {
    if (!caseId || analysisRunning) return;
    setActionError(null);
    setAnalysisRunning(true);
    try {
      await apiRequest(`/api/cases/${caseId}/analysis/run`, { method: 'POST' });
      await fetchCaseCore();
      await fetchTabData();
    } catch (err: any) {
      setActionError(err.message || 'Analysis run failed. Please try again.');
    } finally {
      setAnalysisRunning(false);
    }
  };

  const handleCloseCase = async () => {
    if (!caseId || !closeReason.trim() || closing) return;

    setActionError(null);
    setClosing(true);
    try {
      await apiRequest(`/api/cases/${caseId}/close`, {
        method: 'POST',
        body: JSON.stringify({ reason: closeReason.trim() })
      });
      setCloseDialogOpen(false);
      setCloseReason('');
      await fetchCaseCore();
    } catch (err: any) {
      setActionError(err.message || 'Failed to close case. Please try again.');
    } finally {
      setClosing(false);
    }
  };

  const handleReopenCase = async () => {
    if (!caseId || !reopenReason.trim() || reopening) return;

    setActionError(null);
    setReopening(true);
    try {
      await apiRequest(`/api/cases/${caseId}/reopen`, {
        method: 'POST',
        body: JSON.stringify({ reason: reopenReason.trim() })
      });
      setReopenDialogOpen(false);
      setReopenReason('');
      await refreshCurrentTab();
    } catch (err: any) {
      setActionError(err.message || 'Failed to reopen case. Please try again.');
    } finally {
      setReopening(false);
    }
  };

  if (loading && !caseData) {
    return (
      <div className="page-enter max-w-7xl mx-auto p-4 sm:p-6 space-y-5" aria-live="polite" aria-busy="true">
        <div className="h-28 rounded-md bg-white border border-[#E4DFD3] animate-pulse" />
        <div className="h-12 rounded-md bg-white border border-[#E4DFD3] animate-pulse" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }, (_, index) => <div key={index} className="h-28 rounded-md bg-white border border-[#E4DFD3] animate-pulse" />)}
        </div>
      </div>
    );
  }

  if (!caseData) {
    return (
      <div className="page-enter max-w-3xl mx-auto p-6 sm:p-10" role="alert">
        <div className="border border-[#F8B4B4] bg-white rounded-md p-6 sm:p-8">
          <AlertTriangle className="w-8 h-8 text-[#9B2C2C] mb-4" />
          <h1 className="font-legal-heading text-2xl text-[#14213D]">{loadError ? 'This case could not be opened' : 'Case not found'}</h1>
          <p className="text-sm text-[#5C5E66] mt-2">{loadError || 'The case may have been removed or you may not have access.'}</p>
          {loadError && <button onClick={refreshCurrentTab} className="mt-5 px-4 py-2 bg-[#14213D] text-white rounded text-sm font-semibold">Retry loading</button>}
          <Link to="/lawyer/dashboard" className="mt-5 sm:ml-3 inline-flex px-4 py-2 border border-[#E4DFD3] rounded text-sm font-semibold text-[#14213D]">Back to dashboard</Link>
        </div>
      </div>
    );
  }

  const isClosed = Boolean(caseData.closed_at);

  const tabs = [
    { key: 'overview', label: 'Overview', icon: Briefcase },
    { key: 'evidence', label: 'Evidence', icon: Scale, count: counts.evidence },
    { key: 'conflicts', label: 'Conflicts', icon: AlertTriangle, count: counts.conflicts, alert: counts.conflicts > 0 },
    { key: 'missing', label: 'Missing Evidence', icon: FileQuestion, count: counts.missing, alert: counts.missing > 0 },
    { key: 'reasoning', label: 'AI Reasoning', icon: Scale },
    { key: 'ask', label: 'Ask the Case', icon: Cpu },
    { key: 'agents', label: 'AI Agents', icon: Sparkles },
    { key: 'timeline', label: 'Timeline', icon: Clock },
    { key: 'evolution', label: 'Case Evolution', icon: History },
    { key: 'documents', label: 'Documents', icon: FileText, count: counts.documents },
    { key: 'languages', label: 'Languages', icon: Languages },
    { key: 'entities', label: 'Entities', icon: Users },
    { key: 'guardian', label: 'Guardian Summary', icon: ShieldCheck },
    { key: 'ocr', label: 'OCR', icon: ScanText },
    { key: 'review', label: 'Human Review', icon: UserCheck },
    { key: 'details', label: 'Case Details', icon: Settings }
  ];
  const analysisDelta = deriveAnalysisDelta({ versions, evidence, timeline });

  return (
    <div className="page-enter case-workspace-page flex flex-col min-h-full">
      {/* Sticky Workspace Header */}
      <div className="workspace-sticky sticky top-0 z-30 border-b border-white/60 shadow-lg shadow-blue-950/5">
        <div className="workspace-case-header px-3 sm:px-6 py-3.5 bg-white/70 backdrop-blur-2xl border-b border-white/70">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0 flex-1">
              <Link
                to="/lawyer/dashboard"
                className="p-1.5 hover:bg-[#FAF7F0] rounded text-[#5C5E66] hover:text-[#14213D] border border-[#E4DFD3]"
                title="Back to Dashboard"
              >
                <ArrowLeft className="w-4 h-4" />
              </Link>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-sm text-[#14213D] bg-[#FAF7F0] px-2 py-0.5 rounded border border-[#E4DFD3]">
                    {caseData.case_ref}
                  </span>
                  <h1 className="font-legal-heading text-lg font-bold text-[#14213D] truncate max-w-full min-w-0">
                    {caseData.title}
                  </h1>
                  {caseData.is_demo === 1 && <DemoBadge />}
                </div>

                <div className="flex flex-wrap items-center gap-3 text-xs text-[#5C5E66] mt-1">
                  <span>Forum: <strong className="text-[#2B2D33]">{caseData.court || '—'}</strong></span>
                  <span>·</span>
                  <span>Suit No: <strong className="font-mono text-[#2B2D33]">{caseData.case_number || '—'}</strong></span>
                  {caseData.next_hearing_at && (
                    <>
                      <span>·</span>
                      <span className="flex items-center gap-1 text-[#14213D] font-medium">
                        <Calendar className="w-3.5 h-3.5 text-[#B08D57]" />
                        <span>Next Hearing: {formatDate(caseData.next_hearing_at)}</span>
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Status & Run Analysis Action */}
            <div className="flex items-center gap-3">
              <div className="flex flex-col items-end">
                <StatusBadge status={caseData.status} />
              </div>

              {!isClosed && (
                <button
                  onClick={handleRunAnalysis}
                  disabled={counts.evidence === 0 || analysisRunning}
                  className="px-3.5 py-1.5 bg-[#14213D] hover:bg-[#1E2D4A] text-white rounded text-xs font-semibold shadow-sm transition-colors disabled:opacity-40 inline-flex items-center gap-1.5"
                  title={counts.evidence === 0 ? 'Upload evidence first to run analysis' : 'Reconcile case state'}
                >
                  {analysisRunning ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Play className="w-3.5 h-3.5 text-[#B08D57]" />
                  )}
                  <span>{analysisRunning ? 'Evaluating...' : 'Run analysis'}</span>
                </button>
              )}
              {isClosed && (
                <button
                  onClick={() => setReopenDialogOpen(true)}
                  className="px-3.5 py-1.5 bg-[#14213D] hover:bg-[#1E2D4A] text-white rounded text-xs font-semibold shadow-sm inline-flex items-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-[#B7DCD7]" />
                  <span>Reopen matter</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Tab Navigation Strip */}
        <div role="tablist" aria-label="Case workspace sections" className="workspace-tabs px-3 sm:px-6 flex overflow-x-auto no-scrollbar">
          {tabs.map(tab => {
            const Icon = tab.icon;
            const active = currentTab === tab.key;

            return (
              <button
                key={tab.key}
                id={`case-tab-${tab.key}`}
                role="tab"
                aria-selected={active}
                aria-controls="case-tabpanel"
                tabIndex={active ? 0 : -1}
                onClick={() => handleTabChange(tab.key)}
                onKeyDown={handleTabKeyDown}
                className={`py-3.5 px-3.5 text-sm font-medium border-b-2 flex items-center gap-2 whitespace-nowrap transition-colors ${
                  active
                    ? 'border-[#2563EB] text-[#1D4ED8] font-bold bg-white/50'
                    : 'border-transparent text-[#52617B] hover:text-[#1D4ED8] hover:border-blue-200'
                }`}
              >
                <Icon className={`w-4 h-4 ${active ? 'text-[#2563EB]' : 'text-[#64748B]'}`} />
                <span>{tab.label}</span>
                {tab.count !== undefined && (
                  <span
                    className={`font-mono text-[10px] px-1.5 py-0.2 rounded-full ${
                      tab.alert
                        ? 'bg-[#FDF2F2] text-[#9B2C2C] font-bold'
                        : 'bg-[#FAF7F0] text-[#5C5E66] border border-[#E4DFD3]'
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Tab Content */}
      <div id="case-tabpanel" role="tabpanel" aria-labelledby={`case-tab-${currentTab}`} tabIndex={0} aria-busy={analysisRunning} className="flex-1 p-4 sm:p-7 max-w-7xl mx-auto w-full">
        {(currentTab === 'overview' || currentTab === 'documents' || currentTab === 'reasoning') && analysisDelta && (
          <WhatChangedPanel delta={analysisDelta} onSelectTab={handleTabChange} />
        )}
        {actionError && (
          <div role="alert" className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-[#FDF2F2] border border-[#F8B4B4] rounded text-sm text-[#9B2C2C]">
            <span>{actionError}</span>
            <button onClick={() => setActionError(null)} className="font-semibold underline underline-offset-2 self-start sm:self-auto">Dismiss</button>
          </div>
        )}
        {loadError && (
          <div role="alert" className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-[#FDF2F2] border border-[#F8B4B4] rounded text-sm text-[#9B2C2C]">
            <span>{loadError}</span>
            <button onClick={refreshCurrentTab} className="font-semibold underline underline-offset-2 self-start sm:self-auto">Retry loading</button>
          </div>
        )}
        {currentTab === 'overview' && (
          <OverviewTab
            caseData={caseData}
            parties={parties}
            counts={counts}
            latestAnalysis={latestAnalysis}
            onSelectTab={handleTabChange}
            onRunAnalysis={handleRunAnalysis}
            onCloseCase={() => setCloseDialogOpen(true)}
            onReopenCase={() => setReopenDialogOpen(true)}
            analysisRunning={analysisRunning}
          />
        )}

        {currentTab === 'evidence' && (
          <EvidenceTab
            caseId={caseId!}
            evidence={evidence}
            findings={versions[0]?.reasoning?.findings || []}
            isClosed={isClosed}
            onRefresh={() => {
              fetchCaseCore();
              fetchTabData();
            }}
            onOpenSourceViewer={eid => {
              setSourceViewerEid(eid);
              setSourceViewerDocId(null);
            }}
          />
        )}

        {currentTab === 'conflicts' && (
          <ConflictsTab
            caseId={caseId!}
            conflicts={conflicts}
            hasAnalysis={Boolean(latestAnalysis)}
            isClosed={isClosed}
            onRefresh={() => {
              fetchCaseCore();
              fetchTabData();
            }}
            onOpenSourceViewer={eid => {
              setSourceViewerEid(eid);
              setSourceViewerDocId(null);
            }}
          />
        )}

        {currentTab === 'missing' && (
          <MissingEvidenceTab
            caseId={caseId!}
            missingEvidence={missingEvidence}
            hasAnalysis={Boolean(latestAnalysis)}
            isClosed={isClosed}
            onRefresh={() => {
              fetchCaseCore();
              fetchTabData();
            }}
            onOpenSourceViewer={eid => {
              setSourceViewerEid(eid);
              setSourceViewerDocId(null);
            }}
            onSelectTab={handleTabChange}
          />
        )}

        {currentTab === 'reasoning' && (
          <AiReasoningTab
            caseId={caseId!}
            versions={versions}
            evidenceList={evidence}
            onOpenSourceViewer={eid => {
              setSourceViewerEid(eid);
              setSourceViewerDocId(null);
            }}
            onSelectTab={handleTabChange}
          />
        )}

        {currentTab === 'ask' && <AskTheCaseTab caseId={caseId!} caseTitle={caseData.title} />}

        {currentTab === 'agents' && <AiAgentsTab caseId={caseId!} isClosed={isClosed} />}

        {currentTab === 'timeline' && (
          <TimelineTab
            timeline={timeline}
            onOpenSourceViewer={eid => {
              setSourceViewerEid(eid);
              setSourceViewerDocId(null);
            }}
          />
        )}

        {currentTab === 'evolution' && (
          <EvolutionTab
            caseId={caseId!}
            versions={versions}
            agentState={agentState}
            onRefresh={() => {
              fetchCaseCore();
              fetchTabData();
            }}
          />
        )}

        {currentTab === 'documents' && (
          <DocumentsTab
            caseId={caseId!}
            documents={documents}
            isClosed={isClosed}
            initialJobIds={searchParams.get('jobIds')?.split(',').filter(Boolean) || []}
            onRefresh={refreshCurrentTab}
            onPipelineComplete={refreshAfterProcessing}
            onOpenSourceViewer={(eid, docId) => {
              setSourceViewerEid(eid || null);
              setSourceViewerDocId(docId || null);
            }}
          />
        )}

        {currentTab === 'review' && (
          <HumanReviewTab
            caseId={caseId!}
            evidence={evidence}
            conflicts={conflicts}
            latestAnalysis={latestAnalysis}
            isClosed={isClosed}
            onRefresh={() => {
              fetchCaseCore();
              fetchTabData();
            }}
            onOpenSourceViewer={eid => {
              setSourceViewerEid(eid);
              setSourceViewerDocId(null);
            }}
            onSelectTab={handleTabChange}
          />
        )}

        {currentTab === 'details' && (
          <CaseDetailsTab
            caseId={caseId!}
            caseData={caseData}
            parties={parties}
            isClosed={isClosed}
            onRefresh={() => {
              fetchCaseCore();
              fetchTabData();
            }}
          />
        )}

        {currentTab === 'languages' && (
          <LanguagesTab caseId={caseId!} documents={documents} evidence={evidence} />
        )}

        {currentTab === 'entities' && (
          <EntitiesTab caseId={caseId!} isClosed={isClosed} onRefresh={() => { fetchCaseCore(); fetchTabData(); }} />
        )}

        {currentTab === 'guardian' && (
          <GuardianSummaryTab caseId={caseId!} isClosed={isClosed} />
        )}

        {currentTab === 'ocr' && (
          <OcrTab documents={documents} />
        )}
      </div>

      {/* Global Source Viewer Drawer / Modal */}
      {(sourceViewerEid || sourceViewerDocId) && (
        <SourceViewerModal
          evidenceId={sourceViewerEid}
          documentId={sourceViewerDocId}
          onClose={() => {
            setSourceViewerEid(null);
            setSourceViewerDocId(null);
          }}
        />
      )}

      {closeDialogOpen && (
        <div className="fixed inset-0 z-50 bg-[#0E172B]/60 flex items-center justify-center p-4" onMouseDown={event => event.target === event.currentTarget && !closing && setCloseDialogOpen(false)}>
          <section role="dialog" aria-modal="true" aria-labelledby="close-case-title" className="w-full max-w-md bg-white border border-[#E4DFD3] rounded-md shadow-2xl p-6 space-y-4">
            <div>
              <h2 id="close-case-title" className="font-legal-heading text-xl font-semibold text-[#14213D]">Close this matter?</h2>
              <p className="text-sm text-[#5C5E66] mt-1">The workspace becomes read-only. Add the legal or settlement reason for the audit record.</p>
            </div>
            <label className="block text-sm font-medium text-[#2B2D33]">
              Closure reason
              <textarea autoFocus required rows={4} value={closeReason} onChange={event => setCloseReason(event.target.value)} className="mt-1.5 w-full rounded border border-[#E4DFD3] p-3 text-sm focus:border-[#176B68]" />
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" disabled={closing} onClick={() => setCloseDialogOpen(false)} className="px-4 py-2 border border-[#E4DFD3] rounded text-sm font-medium">Cancel</button>
              <button type="button" disabled={closing || !closeReason.trim()} onClick={handleCloseCase} className="px-4 py-2 bg-[#14213D] text-white rounded text-sm font-semibold disabled:opacity-50">{closing ? 'Closing...' : 'Close matter'}</button>
            </div>
          </section>
        </div>
      )}

      {reopenDialogOpen && (
        <div className="fixed inset-0 z-50 bg-[#0E172B]/60 flex items-center justify-center p-4" onMouseDown={event => event.target === event.currentTarget && !reopening && setReopenDialogOpen(false)}>
          <section role="dialog" aria-modal="true" aria-labelledby="reopen-case-title" className="w-full max-w-md bg-white border border-[#E4DFD3] rounded-md shadow-2xl p-6 space-y-4">
            <div>
              <h2 id="reopen-case-title" className="font-legal-heading text-xl font-semibold text-[#14213D]">Reopen this matter?</h2>
              <p className="text-sm text-[#5C5E66] mt-1">The workspace returns to active review. Record why further proceedings or evidence review is needed.</p>
            </div>
            <label className="block text-sm font-medium text-[#2B2D33]">
              Reason for reopening
              <textarea autoFocus required rows={4} value={reopenReason} onChange={event => setReopenReason(event.target.value)} className="mt-1.5 w-full rounded border border-[#E4DFD3] p-3 text-sm focus:border-[#176B68]" />
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" disabled={reopening} onClick={() => setReopenDialogOpen(false)} className="px-4 py-2 border border-[#E4DFD3] rounded text-sm font-medium">Cancel</button>
              <button type="button" disabled={reopening || !reopenReason.trim()} onClick={handleReopenCase} className="px-4 py-2 bg-[#14213D] text-white rounded text-sm font-semibold disabled:opacity-50">{reopening ? 'Reopening...' : 'Reopen matter'}</button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};
