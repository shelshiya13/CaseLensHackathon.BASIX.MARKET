import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowDownToLine, Check, Clock3, FileCheck2, FileText, History, Loader2, MessageSquare, Printer, RefreshCw, Scale, ShieldAlert, Sparkles, TriangleAlert } from 'lucide-react';
import { apiRequest, getAuthToken } from '../../../lib/api.js';

type AgentType = 'adversarial_review' | 'evidence_request' | 'hearing_preparation';
type Statement = { text: string; evidenceRefs?: string[] };
type AgentRun = {
  id: string; agentType: AgentType; version: number; status: string; engine: string; durationMs: number;
  confidence: number; payload: any; reviewStatus: string; reviewComment?: string | null; createdAt: string; requestItems?: any[];
};
const agents: Array<{ type: AgentType; title: string; description: string; icon: React.FC<any>; action: string; tint: string }> = [
  { type: 'adversarial_review', title: 'Adversarial Review', description: 'Surface contradictions, weak points, missing support, and verification steps.', icon: ShieldAlert, action: 'Run adversarial review', tint: 'from-rose-500 to-orange-400' },
  { type: 'evidence_request', title: 'Evidence Request', description: 'Prepare a lawyer-reviewed client letter, email, and checklist for open evidence gaps.', icon: FileCheck2, action: 'Draft evidence request', tint: 'from-cyan-500 to-blue-500' },
  { type: 'hearing_preparation', title: 'Hearing Preparation', description: 'Build a cited hearing brief from the saved case evidence and timeline.', icon: Scale, action: 'Generate hearing brief', tint: 'from-violet-500 to-indigo-500' }
];
const isStatement = (value: any): value is Statement => Boolean(value && typeof value === 'object' && typeof value.text === 'string');
const collectStatements = (value: any, path = '', output: Array<{ section: string; text: string }> = []) => {
  if (Array.isArray(value)) { value.forEach(item => collectStatements(item, path, output)); return output; }
  if (isStatement(value)) { output.push({ section: path || 'Finding', text: value.text }); return output; }
  if (value && typeof value === 'object') Object.entries(value).forEach(([key, child]) => {
    if (!['aiSuggestions', 'lawyerReviewRequired', 'lawyerNotes'].includes(key)) collectStatements(child, path ? `${path} · ${key}` : key, output);
  });
  return output;
};

const CitationLine: React.FC<{ value: Statement; className?: string }> = ({ value, className = '' }) => (
  <p className={`text-sm leading-6 text-slate-700 ${className}`}>
    {value.text}
    {!!value.evidenceRefs?.length && <span className="ml-2 inline-flex flex-wrap gap-1 align-middle">{value.evidenceRefs.map(ref => <span key={ref} className="rounded-md border border-blue-200/80 bg-blue-50 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-blue-700">{ref}</span>)}</span>}
  </p>
);

const Statements: React.FC<{ title: string; values?: Statement[]; empty?: string }> = ({ title, values = [], empty = 'Unable to establish this from available evidence.' }) => (
  <section className="space-y-2.5">
    <h4 className="text-xs font-bold uppercase tracking-[.12em] text-slate-500">{title}</h4>
    {values.length ? <ul className="space-y-2.5">{values.map((item, i) => <li key={`${item.text}-${i}`}><CitationLine value={item} /></li>)}</ul> : <p className="text-sm text-slate-400">{empty}</p>}
  </section>
);

export const AiAgentsTab: React.FC<{ caseId: string; isClosed: boolean }> = ({ caseId, isClosed }) => {
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [status, setStatus] = useState<Record<string, AgentRun>>({});
  const [running, setRunning] = useState<AgentType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [comment, setComment] = useState<Record<string, string>>({});
  const [compareTo, setCompareTo] = useState<Record<string, string>>({});

  const refresh = async () => {
    try {
      const result = await apiRequest<{ agents: Record<string, AgentRun>; runs: AgentRun[] }>(`/api/cases/${caseId}/ai-agents`);
      setRuns(result.runs || []);
      setStatus(result.agents || {});
      setError('');
    } catch (err: any) { setError(err?.message || 'Agent history could not be loaded.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void refresh(); }, [caseId]);

  const runsByAgent = useMemo(() => Object.fromEntries(agents.map(agent => [agent.type, runs.filter(run => run.agentType === agent.type)])), [runs]);
  const execute = async (type: AgentType) => {
    setRunning(type); setError('');
    try {
      await apiRequest(`/api/cases/${caseId}/ai-agents/${type}/run`, { method: 'POST', body: JSON.stringify({}) });
      await refresh();
    } catch (err: any) { setError(err?.message || 'Agent could not run. Please retry.'); }
    finally { setRunning(null); }
  };
  const review = async (run: AgentRun, decision: 'approve' | 'dismiss' | 'comment') => {
    try {
      await apiRequest(`/api/cases/${caseId}/ai-agents/runs/${run.id}/review`, { method: 'PATCH', body: JSON.stringify({ decision, comment: comment[run.id] || '' }) });
      await refresh();
    } catch (err: any) { setError(err?.message || 'Review update could not be saved.'); }
  };
  const verifyRequestItem = async (itemId: string, verified: boolean) => {
    try {
      await apiRequest(`/api/cases/${caseId}/ai-agents/evidence-requests/${itemId}/verify`, { method: 'POST', body: JSON.stringify({ verified }) });
      await refresh();
    } catch (err: any) { setError(err?.message || 'Evidence status could not be updated.'); }
  };
  const download = async (run: AgentRun, extension: 'pdf' | 'md') => {
    try {
      const token = getAuthToken();
      const response = await fetch(`/api/cases/${caseId}/ai-agents/runs/${run.id}/brief.${extension}`, { credentials: 'include', headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!response.ok) throw new Error('The hearing brief export could not be downloaded.');
      const blob = await response.blob(); const url = URL.createObjectURL(blob);
      const link = document.createElement('a'); link.href = url; link.download = `caselens-hearing-brief-v${run.version}.${extension}`; link.click(); URL.revokeObjectURL(url);
    } catch (err: any) { setError(err?.message || 'Export failed.'); }
  };

  const activeRunFor = (type: AgentType) => status[type]?.id ? status[type] : runsByAgent[type]?.[0];
  const renderRun = (run: AgentRun) => {
    const payload = run.payload || {};
    if (run.agentType === 'adversarial_review') return <div className="space-y-5">
      {isStatement(payload.summary) && <CitationLine value={payload.summary} />}
      {(payload.findings || []).length ? <div className="grid gap-3">{payload.findings.map((finding: any, index: number) => <article key={finding.id || index} className="rounded-2xl border border-rose-100 bg-gradient-to-br from-white to-rose-50/60 p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h4 className="font-semibold text-slate-800">{finding.category}</h4><div className="flex gap-2"><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${finding.riskLevel === 'High' ? 'bg-rose-100 text-rose-700' : finding.riskLevel === 'Medium' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>{finding.riskLevel} risk</span><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600">For Human Review</span></div></div>
        <div className="space-y-3"><div><span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Counter argument</span><CitationLine value={finding.counterArgument} /></div>{finding.alternativeInterpretation && <div><span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Alternative interpretation</span><CitationLine value={finding.alternativeInterpretation} /></div>}{finding.credibilityIssue && <div><span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Credibility issue</span><CitationLine value={finding.credibilityIssue} /></div>}{finding.proceduralRisk && <div><span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Procedural review</span><CitationLine value={finding.proceduralRisk} /></div>}<div><span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Suggested lawyer verification</span><CitationLine value={finding.suggestedVerification} /></div><div><span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Confidence explanation</span><CitationLine value={finding.confidenceExplanation} /></div></div>
      </article>)}</div> : <p className="text-sm text-slate-500">{payload.summary?.text || 'Unable to establish this from available evidence.'}</p>}
      <ReviewControls run={run} comment={comment} setComment={setComment} onReview={review} isClosed={isClosed} />
    </div>;
    if (run.agentType === 'evidence_request') return <div className="space-y-5">
      {isStatement(payload.summary) && <CitationLine value={payload.summary} />}
      <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-sm font-medium text-amber-900">Lawyer approval required. Nothing has been sent to the client.</div>
      <Statements title="Client checklist" values={payload.clientChecklist} />
      <Statements title="Professional letter draft" values={payload.professionalLetter} />
      <Statements title="Email draft" values={payload.email} />
      <div className="space-y-2">{(payload.requests || []).map((item: any) => <div key={item.missingEvidenceId} className="rounded-xl border border-slate-200 bg-white/80 p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><strong className="text-sm text-slate-800">{item.document}</strong><span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold uppercase text-amber-700">{item.status.replace(/_/g, ' ')}</span></div>
        <p className="mb-2 text-[11px] text-slate-500">Linked missing-evidence item: {item.missingRef}</p><CitationLine value={item.reason} /><div className="mt-2"><CitationLine value={item.expectedImpact} /></div>
      </div>)}</div>
      {run.reviewStatus === 'pending' && !isClosed && <div className="flex flex-wrap gap-2"><button onClick={() => void review(run, 'approve')} className="rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/20"><Check className="mr-1.5 inline h-4 w-4" />Approve drafts for lawyer use</button><button onClick={() => void review(run, 'dismiss')} className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-800">Dismiss request</button></div>}
      {(run.requestItems || []).length > 0 && <section className="space-y-2"><h4 className="text-xs font-bold uppercase tracking-[.12em] text-slate-500">Requested document progress</h4>{run.requestItems?.map(item => <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white/80 px-4 py-3"><span className="text-sm font-medium text-slate-700">{item.missingRef} · {item.document}</span><span className="rounded-full bg-cyan-50 px-2.5 py-1 text-[10px] font-bold uppercase text-cyan-700">{item.status.replace(/_/g, ' ')}</span>{item.status === 'pending_review' && !isClosed && <button onClick={() => void verifyRequestItem(item.id, true)} className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800">Verify received item</button>}</div>)}</section>}
    </div>;
    return <div className="space-y-5">
      <div className="flex flex-wrap gap-2 print:hidden"><button onClick={() => void download(run, 'pdf')} className="rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 px-3.5 py-2 text-xs font-semibold text-white shadow-md"><ArrowDownToLine className="mr-1.5 inline h-3.5 w-3.5" />Export PDF</button><button onClick={() => void download(run, 'md')} className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700"><FileText className="mr-1.5 inline h-3.5 w-3.5" />Markdown</button><button onClick={() => window.print()} className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700"><Printer className="mr-1.5 inline h-3.5 w-3.5" />Print</button></div>
      {isStatement(payload.caseOverview) && <section className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50/80 to-white p-4"><h4 className="mb-2 text-xs font-bold uppercase tracking-[.12em] text-indigo-700">Case overview</h4><CitationLine value={payload.caseOverview} /></section>}
      <Statements title="Verified facts" values={payload.verifiedFacts} />
      <Statements title="Timeline summary" values={(payload.timeline || []).map((item: any) => ({ ...item.statement, text: `${item.date || 'Date not specified'} · ${item.statement?.text || ''}` }))} />
      <Statements title="Evidence summary" values={payload.evidenceSummary} />
      <div className="grid gap-5 sm:grid-cols-2"><Statements title="Strong evidence" values={payload.evidenceStrength?.strong} /><Statements title="Weak evidence" values={payload.evidenceStrength?.weak} /></div>
      <Statements title="Open conflicts" values={payload.openConflicts} />
      <Statements title="Missing evidence" values={payload.missingEvidence} />
      <div className="grid gap-5 sm:grid-cols-2"><Statements title="Witness suggestions" values={payload.witnessSuggestions} /><Statements title="Documents to carry" values={payload.documentsToCarry} /></div>
      <div className="grid gap-5 sm:grid-cols-2"><Statements title="Questions for client" values={payload.questionsForClient} /><Statements title="Possible questions from opposing counsel" values={payload.possibleQuestionsFromOpposingCounsel} /></div>
      <Statements title="Potential weaknesses" values={payload.potentialWeaknesses} />
      <Statements title="Risk summary" values={payload.riskSummary} />
    </div>;
  };

  if (loading) return <div className="grid gap-4 lg:grid-cols-3" aria-busy="true">{agents.map(agent => <div key={agent.type} className="h-48 animate-pulse rounded-3xl border border-white/80 bg-white/70" />)}</div>;
  return <div className="space-y-6">
    <header className="relative overflow-hidden rounded-[26px] border border-white/30 bg-gradient-to-br from-[#111b35] via-[#1d3f84] to-[#38266f] p-6 text-white shadow-xl shadow-indigo-950/15 sm:p-8">
      <div className="pointer-events-none absolute -right-12 -top-20 size-64 rounded-full border border-white/10 shadow-[0_0_0_28px_rgba(255,255,255,.035),0_0_0_58px_rgba(255,255,255,.025)]" />
      <div className="relative flex flex-wrap items-end justify-between gap-4"><div><p className="mb-2 text-[10px] font-bold uppercase tracking-[.2em] text-cyan-200">CaseLens · Evidence-grounded agents</p><h2 className="font-legal-heading text-2xl font-semibold sm:text-3xl">AI Agents</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-blue-100/80">Three review tools share the saved case record. Every finding links to evidence, every draft stays private, and a lawyer remains in control.</p></div><button onClick={() => void refresh()} className="rounded-xl border border-white/15 bg-white/10 p-2.5 text-white transition hover:bg-white/15" aria-label="Refresh agent history"><RefreshCw className="h-4 w-4" /></button></div>
    </header>
    {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"><AlertTriangle className="mr-2 inline h-4 w-4" />{error}</div>}
    <div className="grid gap-4 xl:grid-cols-3">{agents.map(agent => {
      const Icon = agent.icon; const current = activeRunFor(agent.type); const history = runsByAgent[agent.type] || [];
      return <article key={agent.type} className="group rounded-3xl border border-white/75 bg-white/80 p-5 shadow-[0_18px_54px_-36px_rgba(30,41,90,.45)] backdrop-blur-xl transition duration-200 hover:-translate-y-1 hover:shadow-xl">
        <div className="flex items-start justify-between gap-3"><div className={`grid size-11 place-items-center rounded-2xl bg-gradient-to-br ${agent.tint} text-white shadow-lg`}><Icon className="h-5 w-5" /></div><StatusPill run={current} /></div>
        <h3 className="mt-4 text-base font-semibold text-slate-900">{agent.title}</h3><p className="mt-1 min-h-10 text-xs leading-5 text-slate-500">{agent.description}</p>
        <button disabled={isClosed || running !== null} onClick={() => void execute(agent.type)} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-3 py-2.5 text-xs font-semibold text-white shadow-md shadow-slate-900/10 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
          {running === agent.type ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}{running === agent.type ? 'Working through evidence…' : agent.action}
        </button>
        <div className="mt-3 flex items-center justify-between text-[10px] text-slate-400"><span className="inline-flex items-center gap-1"><Clock3 className="h-3 w-3" />{current ? `${current.durationMs} ms` : 'No executions yet'}</span><span>{history.length} version{history.length === 1 ? '' : 's'}</span></div>
      </article>;
    })}</div>
    {agents.map(agent => {
      const history = runsByAgent[agent.type] || []; const current = activeRunFor(agent.type);
      if (!current) return null;
      const previousRun = history.find(run => run.id === compareTo[agent.type]);
      return <section key={`${agent.type}-output`} className="overflow-hidden rounded-3xl border border-white/75 bg-white/85 shadow-[0_24px_70px_-40px_rgba(30,41,90,.46)] backdrop-blur-xl">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-gradient-to-r from-white to-indigo-50/60 px-5 py-4 sm:px-6"><div><h3 className="font-legal-heading text-lg font-semibold text-slate-900">{agent.title} · v{current.version}</h3><p className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-500"><span>{current.engine === 'deterministic rules' ? 'Deterministic fallback' : current.engine}</span><span>·</span><span>{current.durationMs} ms</span><span>·</span><span>{Math.round(current.confidence * 100)}% citation coverage</span></p></div><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${current.reviewStatus === 'approved' ? 'bg-emerald-100 text-emerald-700' : current.reviewStatus === 'dismissed' ? 'bg-slate-100 text-slate-600' : 'bg-amber-100 text-amber-800'}`}>{current.reviewStatus === 'pending' ? 'Lawyer review pending' : current.reviewStatus}</span>{history.length > 1 && <label className="flex items-center gap-2 text-[11px] text-slate-500"><History className="h-3.5 w-3.5" />Compare<select aria-label={`Compare ${agent.title} version`} value={compareTo[agent.type] || ''} onChange={event => setCompareTo({ ...compareTo, [agent.type]: event.target.value })} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"><option value="">Previous version…</option>{history.filter(run => run.id !== current.id).map(run => <option key={run.id} value={run.id}>v{run.version} · {new Date(run.createdAt).toLocaleDateString()}</option>)}</select></label>}</div></div>
        <div className="space-y-5 p-5 sm:p-6">{previousRun && <div className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4"><p className="mb-3 inline-flex items-center gap-1.5 text-xs font-bold text-indigo-700"><History className="h-3.5 w-3.5" />Version comparison · v{previousRun.version} → v{current.version}</p><div className="grid gap-3 md:grid-cols-2"><div className="rounded-xl border border-white/80 bg-white/75 p-3"><h4 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">Previous</h4><ComparisonStatements values={collectStatements(previousRun.payload).slice(0, 16)} /></div><div className="rounded-xl border border-indigo-100 bg-white p-3"><h4 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-indigo-600">Current</h4><ComparisonStatements values={collectStatements(current.payload).slice(0, 16)} /></div></div></div>}
          {renderRun(current)}
          {current.payload?.aiSuggestions?.length > 0 && <Statements title="Additional Gemini suggestions · For Human Review" values={current.payload.aiSuggestions} />}
          {current.status === 'failed' && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">Agent execution did not complete. Existing case analysis remains available; retry when ready.</div>}
          {agent.type !== 'evidence_request' && !isClosed && <div className="flex flex-wrap items-end gap-2 border-t border-slate-100 pt-4"><label className="min-w-56 flex-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">Lawyer review note<textarea value={comment[current.id] ?? current.reviewComment ?? ''} onChange={event => setComment({ ...comment, [current.id]: event.target.value })} maxLength={2000} rows={2} className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm font-normal normal-case tracking-normal text-slate-700" placeholder="Private note for this review version" /></label><button onClick={() => void review(current, 'comment')} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-700"><MessageSquare className="mr-1.5 inline h-3.5 w-3.5" />Save note</button>{current.reviewStatus === 'pending' && <><button onClick={() => void review(current, 'approve')} className="rounded-xl bg-emerald-600 px-3 py-2.5 text-xs font-semibold text-white"><Check className="mr-1.5 inline h-3.5 w-3.5" />Approve</button><button onClick={() => void review(current, 'dismiss')} className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs font-semibold text-rose-800"><TriangleAlert className="mr-1.5 inline h-3.5 w-3.5" />Dismiss</button></>}</div>}
        </div>
      </section>;
    })}
    {runs.length === 0 && <div className="rounded-3xl border border-dashed border-indigo-200 bg-white/55 p-8 text-center"><div className="mx-auto mb-3 grid size-12 place-items-center rounded-2xl bg-indigo-50 text-indigo-600"><Sparkles className="h-5 w-5" /></div><h3 className="font-semibold text-slate-800">No agent runs yet</h3><p className="mt-1 text-sm text-slate-500">Choose an agent above to create a cited, versioned review from the saved case evidence.</p></div>}
    <p className="text-center text-[10px] text-slate-400">AI generated content is a review aid, not legal advice. Check each E-reference against its source before relying on it.</p>
  </div>;
};

const StatusPill: React.FC<{ run?: AgentRun }> = ({ run }) => {
  const status = run?.status || 'idle';
  const color = status === 'completed' ? 'bg-emerald-100 text-emerald-700' : status === 'fallback' ? 'bg-amber-100 text-amber-800' : status === 'failed' ? 'bg-rose-100 text-rose-700' : status === 'running' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500';
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${color}`}><span className={`size-1.5 rounded-full ${status === 'running' ? 'animate-pulse bg-blue-600' : 'bg-current'}`} />{status}</span>;
};

const ReviewControls: React.FC<{ run: AgentRun; comment: Record<string, string>; setComment: (value: Record<string, string>) => void; onReview: (run: AgentRun, decision: 'approve' | 'dismiss' | 'comment') => void; isClosed: boolean }> = ({ run, comment, setComment, onReview, isClosed }) => !isClosed ? <div className="flex flex-wrap items-end gap-2 border-t border-slate-100 pt-4"><label className="min-w-56 flex-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">Lawyer review note<textarea value={comment[run.id] ?? run.reviewComment ?? ''} onChange={event => setComment({ ...comment, [run.id]: event.target.value })} maxLength={2000} rows={2} className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm font-normal normal-case tracking-normal text-slate-700" placeholder="Private note for this review version" /></label><button onClick={() => onReview(run, 'comment')} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-700"><MessageSquare className="mr-1.5 inline h-3.5 w-3.5" />Save note</button>{run.reviewStatus === 'pending' && <><button onClick={() => onReview(run, 'approve')} className="rounded-xl bg-emerald-600 px-3 py-2.5 text-xs font-semibold text-white"><Check className="mr-1.5 inline h-3.5 w-3.5" />Approve</button><button onClick={() => onReview(run, 'dismiss')} className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs font-semibold text-rose-800">Dismiss</button></>}</div> : null;

const ComparisonStatements: React.FC<{ values: Array<{ section: string; text: string }> }> = ({ values }) => values.length
  ? <ul className="max-h-64 space-y-2 overflow-y-auto">{values.map((item, index) => <li key={`${item.section}-${index}`} className="border-b border-slate-100 pb-2 last:border-0"><span className="block text-[9px] font-bold uppercase text-slate-400">{item.section.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ')}</span><span className="mt-0.5 block text-[11px] leading-5 text-slate-600">{item.text}</span></li>)}</ul>
  : <p className="text-xs text-slate-400">Unable to establish this from available evidence.</p>;
