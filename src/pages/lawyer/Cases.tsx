import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, BriefcaseBusiness, CalendarDays, FileCheck2, FileText, Plus, Search, SlidersHorizontal } from 'lucide-react';
import { apiRequest } from '../../lib/api.js';
import { formatDate } from '../../lib/format.js';
import { AppBadge, AppButton, AppInput, AppSection, AppTable } from '../../components/ui/AppPrimitives.js';

type CaseRecord = Record<string, any>;
const statusTone = (status: string): 'blue' | 'violet' | 'cyan' | 'green' | 'amber' | 'rose' | 'slate' => {
  if (/closed/i.test(status)) return 'slate';
  if (/conflict/i.test(status)) return 'rose';
  if (/missing/i.test(status)) return 'amber';
  if (/review/i.test(status)) return 'violet';
  if (/decision|assessment/i.test(status)) return 'green';
  if (/new/i.test(status)) return 'cyan';
  return 'blue';
};
const progressFor = (status: string) => /closed|decision|assessment/i.test(status) ? 100 : /human review/i.test(status) ? 86 : /conflict|missing/i.test(status) ? 72 : /evidence review/i.test(status) ? 58 : /analysis/i.test(status) ? 38 : /new/i.test(status) ? 16 : 28;

export const Cases: React.FC = () => {
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [analysisCounts, setAnalysisCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('ALL');
  const [conflictsOnly, setConflictsOnly] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setLoading(true);
        const response = await apiRequest<{ cases: CaseRecord[] }>('/api/cases');
        if (!active) return;
        const rows = response.cases || [];
        setCases(rows);
        const counts = await Promise.all(rows.map(async item => {
          try {
            const versions = await apiRequest<{ versions: any[] }>(`/api/cases/${item.id}/analysis/versions`);
            return [item.id, (versions.versions || []).length] as const;
          } catch { return [item.id, 0] as const; }
        }));
        if (active) setAnalysisCounts(Object.fromEntries(counts));
      } catch (err: any) {
        if (active) setError(err?.message || 'Could not load your cases. Check your connection and retry.');
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, []);

  const statuses = useMemo(() => [...new Set(cases.map(item => item.status).filter(Boolean))].sort(), [cases]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return cases.filter(item => {
      const matchesText = !needle || [item.case_ref, item.title, item.court, item.case_number, item.case_type].some(value => String(value || '').toLowerCase().includes(needle));
      return matchesText && (status === 'ALL' || item.status === status) && (!conflictsOnly || item.conflict_count > 0);
    });
  }, [cases, query, status, conflictsOnly]);

  return <div className="page-enter mx-auto max-w-7xl space-y-6 p-4 sm:p-7 lg:p-9">
    <header className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-blue-950 to-indigo-900 p-6 text-white shadow-xl shadow-blue-950/15 sm:p-9">
      <div className="pointer-events-none absolute -right-16 -top-24 size-80 rounded-full border border-white/10 shadow-[0_0_0_28px_rgba(255,255,255,.035),0_0_0_58px_rgba(255,255,255,.025)]" />
      <div className="relative flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between"><div><AppBadge tone="cyan" className="bg-white/10 text-cyan-100 ring-white/15">CASE MANAGEMENT</AppBadge><h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">Cases</h1><p className="mt-2 max-w-xl text-sm leading-6 text-blue-100/80">A focused workspace for the matters, hearings, and evidence your team is managing.</p></div><Link to="/lawyer/cases/new" className="inline-flex min-h-10 items-center justify-center gap-2 self-start rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"><Plus className="size-4" />Create new case</Link></div>
      <div className="relative mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4"><MiniStat label="All cases" value={cases.length} icon={<BriefcaseBusiness />} /><MiniStat label="Open matters" value={cases.filter(item => item.status !== 'Closed').length} icon={<FileCheck2 />} /><MiniStat label="Evidence gaps" value={cases.reduce((sum, item) => sum + Number(item.missing_count || 0), 0)} icon={<FileText />} /><MiniStat label="Hearings set" value={cases.filter(item => item.next_hearing_at && new Date(item.next_hearing_at) >= new Date()).length} icon={<CalendarDays />} /></div>
    </header>

    <AppSection title="Case directory" eyebrow="Matter portfolio" action={<span className="text-xs font-medium text-slate-500">{filtered.length} of {cases.length} cases</span>}>
      <div className="mb-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_200px_auto]">
        <div className="relative"><Search aria-hidden="true" className="absolute left-3.5 top-3 size-4 text-slate-400" /><AppInput aria-label="Search cases" placeholder="Search by reference, title, court…" value={query} onChange={event => setQuery(event.target.value)} className="pl-11" /></div>
        <label className="relative"><span className="sr-only">Filter by status</span><SlidersHorizontal aria-hidden="true" className="absolute left-3.5 top-3 size-4 text-slate-400" /><select aria-label="Filter by status" value={status} onChange={event => setStatus(event.target.value)} className="min-h-11 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-3 text-sm text-slate-800 shadow-sm focus:outline-none focus:ring-4 focus:ring-blue-100"><option value="ALL">All statuses</option>{statuses.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
        <AppButton variant={conflictsOnly ? 'danger' : 'secondary'} aria-pressed={conflictsOnly} onClick={() => setConflictsOnly(current => !current)} icon={<AlertTriangle className="size-4" />}>Conflicts only</AppButton>
      </div>

      {error && <div role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">{error}</div>}
      {loading ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Loading cases">{Array.from({ length: 6 }, (_, index) => <div key={index} className="h-56 animate-pulse rounded-2xl bg-slate-100" />)}</div> : filtered.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 px-6 py-12 text-center"><BriefcaseBusiness className="mx-auto size-9 text-slate-400" /><h3 className="mt-3 font-semibold text-slate-900">{cases.length ? 'No cases match these filters' : 'Your case directory is ready'}</h3><p className="mt-1 text-sm text-slate-600">{cases.length ? 'Try a different search or status filter.' : 'Create a matter to start organizing its evidence and hearings.'}</p>{!cases.length && <Link to="/lawyer/cases/new" className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg hover:bg-blue-700"><Plus className="size-4" />Create a case</Link>}</div> : <>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map(item => <CaseCard key={item.id} item={item} analysisCount={analysisCounts[item.id] || 0} />)}
        </div>
        <details className="mt-6"><summary className="cursor-pointer text-xs font-semibold text-slate-600">Open compact table view</summary><div className="mt-3"><AppTable><thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500"><tr>{['Reference','Case','Court','Status','Next hearing','Evidence','AI analyses'].map(header => <th key={header} className="px-4 py-3 font-semibold">{header}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{filtered.map(item => <tr key={item.id} className="hover:bg-blue-50/50"><td className="px-4 py-3 font-mono text-xs font-semibold text-blue-800">{item.case_ref}</td><td className="px-4 py-3 font-medium text-slate-900">{item.title}</td><td className="px-4 py-3 text-slate-600">{item.court || 'Not set'}</td><td className="px-4 py-3"><AppBadge tone={statusTone(item.status)}>{item.status}</AppBadge></td><td className="px-4 py-3 text-slate-600">{item.next_hearing_at ? formatDate(item.next_hearing_at) : 'Not scheduled'}</td><td className="px-4 py-3 text-slate-700">{item.evidence_count || 0}</td><td className="px-4 py-3 text-slate-700">{analysisCounts[item.id] || 0}</td></tr>)}</tbody></AppTable></div></details>
      </>}
    </AppSection>
  </div>;
};

const MiniStat: React.FC<{ label: string; value: number; icon: React.ReactNode }> = ({ label, value, icon }) => <div className="flex min-w-0 items-center gap-3 rounded-2xl border border-white/10 bg-white/[.08] p-3 backdrop-blur-sm"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/10 text-cyan-100 [&_svg]:size-4">{icon}</span><div className="min-w-0"><p className="truncate text-lg font-bold tabular-nums">{value}</p><p className="truncate text-[10px] font-medium text-blue-100/75">{label}</p></div></div>;

const CaseCard: React.FC<{ item: CaseRecord; analysisCount: number }> = ({ item, analysisCount }) => {
  const progress = progressFor(item.status || '');
  return <article className="group flex min-w-0 flex-col rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_14px_40px_-30px_rgba(15,23,42,.28)] transition duration-200 hover:-translate-y-1 hover:border-blue-200 hover:shadow-xl">
    <div className="flex items-start justify-between gap-3"><span className="font-mono text-[11px] font-bold tracking-wide text-blue-700">{item.case_ref}</span><AppBadge tone={statusTone(item.status)}>{item.status}</AppBadge></div>
    <h3 className="mt-3 line-clamp-2 min-h-12 text-base font-bold leading-6 text-slate-900"><Link className="rounded-sm outline-offset-4 group-hover:text-blue-800 focus-visible:outline-2 focus-visible:outline-blue-600" to={`/lawyer/cases/${item.id}`}>{item.title}</Link></h3>
    <p className="mt-1 truncate text-xs text-slate-500">{item.court || 'Court not added'}{item.case_number ? ` · ${item.case_number}` : ''}</p>
    <div className="mt-5"><div className="mb-2 flex items-center justify-between text-[10px] font-semibold text-slate-500"><span>Case progress</span><span>{progress}%</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-gradient-to-r from-blue-600 via-violet-600 to-cyan-500 transition-[width] duration-700" style={{ width: `${progress}%` }} /></div></div>
    <div className="mt-5 grid grid-cols-3 gap-2 border-t border-slate-100 pt-4"><Count label="Evidence" value={item.evidence_count || 0} /><Count label="AI analyses" value={analysisCount} /><Count label="Open gaps" value={item.missing_count || 0} /></div>
    <div className="mt-4 flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2.5"><span className="inline-flex min-w-0 items-center gap-2 text-[11px] text-slate-600"><CalendarDays className="size-4 shrink-0 text-blue-600" /><span className="truncate">Next hearing</span></span><span className="truncate text-right text-[11px] font-semibold text-slate-800">{item.next_hearing_at ? formatDate(item.next_hearing_at) : 'Not scheduled'}</span></div>
    <Link to={`/lawyer/cases/${item.id}`} className="mt-4 inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-xs font-semibold text-white transition hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">Open case workspace <ArrowRight className="size-3.5" /></Link>
  </article>;
};

const Count: React.FC<{ label: string; value: number }> = ({ label, value }) => <div className="min-w-0 text-center"><p className="text-base font-bold tabular-nums text-slate-900">{value}</p><p className="truncate text-[9px] font-medium text-slate-500">{label}</p></div>;
