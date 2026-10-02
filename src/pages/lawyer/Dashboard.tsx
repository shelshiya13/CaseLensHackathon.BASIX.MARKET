import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { Activity, ArrowRight, Bell, CalendarClock, CheckCircle2, ChevronRight, Clock3, FileCheck2, FileText, HeartHandshake, Lightbulb, Plus, Scale, ShieldCheck, Sparkles, UploadCloud } from 'lucide-react';
import { apiRequest } from '../../lib/api.js';
import { formatDate, formatDateTime } from '../../lib/format.js';
import { AppBadge, AppSection, AppStatCard } from '../../components/ui/AppPrimitives.js';

type DashboardData = { summary?: Record<string, number>; upcomingHearings?: any[]; recentlyUpdatedCases?: any[]; recentEvidence?: any[] };
type NoticeData = { notifications?: any[]; unreadCount?: number };

export const Dashboard: React.FC = () => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [notices, setNotices] = useState<NoticeData>({});
  const [health, setHealth] = useState<any>(null);
  const [agentActivity, setAgentActivity] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    Promise.allSettled([
      apiRequest<DashboardData>('/api/dashboard/lawyer'),
      apiRequest<NoticeData>('/api/notifications'),
      apiRequest<any>('/api/system/health'),
      apiRequest<any>('/api/system/metrics')
    ]).then(([portfolio, notificationResult, systemHealth, metrics]) => {
      if (!active) return;
      if (portfolio.status === 'fulfilled') setData(portfolio.value);
      else setError('Portfolio data could not be loaded. Check your connection and retry.');
      if (notificationResult.status === 'fulfilled') setNotices(notificationResult.value);
      if (systemHealth.status === 'fulfilled') setHealth(systemHealth.value.health);
      if (metrics.status === 'fulfilled') setAgentActivity(metrics.value.agents || []);
      setLoading(false);
    });
    return () => { active = false; };
  }, []);

  const summary = data?.summary || {};
  const cases = data?.recentlyUpdatedCases || [];
  const hearings = data?.upcomingHearings || [];
  const evidence = data?.recentEvidence || [];
  const notifications = notices.notifications || [];
  const pendingRequests = notifications.filter(item => /guardian|request/i.test(String(item.kind || '') + ' ' + String(item.title || ''))).length;
  const nextCase = cases[0];
  const unread = notices.unreadCount || 0;
  const insight = useMemo(() => {
    if (!summary.totalCases) return 'Create a case to start building a searchable, evidence-linked portfolio.';
    if (summary.casesWithMissingEvidence) return summary.casesWithMissingEvidence + ' matters have open evidence gaps. Review the next document request before your upcoming hearings.';
    if (hearings.length) return 'Your next hearing is ' + formatDate(hearings[0].next_hearing_at) + '. Review the linked case record and prepare the hearing brief.';
    return 'Your active matters have no recorded evidence gaps. Keep case records current as new documents arrive.';
  }, [summary.totalCases, summary.casesWithMissingEvidence, hearings]);

  const quickActions = [
    { label: 'New case', hint: 'Open a matter', icon: Plus, to: '/lawyer/cases/new', tint: 'bg-blue-50 text-blue-700' },
    { label: 'Upload evidence', hint: 'Add a case document', icon: UploadCloud, to: nextCase ? '/lawyer/cases/' + nextCase.id + '?tab=documents' : '/lawyer/cases/new', tint: 'bg-cyan-50 text-cyan-800' },
    { label: 'Hearing brief', hint: 'Prepare from evidence', icon: FileCheck2, to: nextCase ? '/lawyer/cases/' + nextCase.id + '?tab=ask' : '/lawyer/cases', tint: 'bg-violet-50 text-violet-800' },
    { label: 'Ask AI', hint: 'Ask about the record', icon: Sparkles, to: nextCase ? '/lawyer/cases/' + nextCase.id + '?tab=ask' : '/lawyer/cases', tint: 'bg-indigo-50 text-indigo-800' },
    { label: 'Export report', hint: 'Download the case summary', icon: FileText, to: '/lawyer/cases', href: nextCase ? '/api/cases/' + nextCase.id + '/export.pdf' : undefined, tint: 'bg-slate-100 text-slate-700' }
  ];

  return <div className="page-enter mx-auto max-w-[1500px] space-y-6 p-4 sm:p-7 lg:p-9">
    <motion.header initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .35 }} className="relative isolate overflow-hidden rounded-[28px] bg-gradient-to-br from-slate-950 via-blue-950 to-indigo-950 p-6 text-white shadow-2xl shadow-indigo-950/15 sm:p-9 lg:p-10">
      <div className="pointer-events-none absolute -right-16 -top-28 size-96 rounded-full border border-white/10 shadow-[0_0_0_32px_rgba(255,255,255,.025),0_0_0_66px_rgba(255,255,255,.02)]" />
      <div className="pointer-events-none absolute right-20 top-10 hidden opacity-20 lg:block"><Scale className="size-36 stroke-[.6]" /></div>
      <div className="relative flex flex-col gap-7 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl"><AppBadge tone="cyan" className="bg-white/10 text-cyan-100 ring-white/15"><Activity className="mr-1.5 size-3" /> EXECUTIVE OVERVIEW</AppBadge><h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">Good to see you, Counsel.</h1><p className="mt-3 max-w-xl text-sm leading-6 text-blue-100/80">Your portfolio at a glance. See what needs attention and move into your next action.</p></div>
        <div className="relative flex flex-wrap gap-2"><Link to="/lawyer/cases/new" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"><Plus className="size-4" />New case</Link><Link to="/lawyer/cases" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">View cases <ArrowRight className="size-4" /></Link></div>
      </div>
      <div className="relative mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-white/10 pt-4 text-[11px] text-blue-100/75"><span className="inline-flex items-center gap-2"><span className="size-2 rounded-full bg-emerald-400 shadow-[0_0_0_4px_rgba(52,211,153,.14)]" />{loading ? 'Refreshing portfolio' : 'Portfolio synced'}</span><span>{Number(summary.activeCases || 0)} active matters</span><span>{hearings.length} scheduled hearings</span></div>
    </motion.header>

    {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">{error}<button className="font-semibold underline" onClick={() => window.location.reload()}>Refresh dashboard</button></div>}

    <section aria-label="Portfolio summary" className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      <AppStatCard label="Active cases" value={summary.activeCases || 0} detail={Number(summary.totalCases || 0) + ' total matters'} icon={<Scale />} gradient="from-blue-600 to-blue-800" href="/lawyer/cases" loading={loading} />
      <AppStatCard label="Upcoming hearings" value={hearings.length} detail={hearings.length ? 'Next: ' + formatDate(hearings[0].next_hearing_at) : 'No hearings scheduled'} icon={<CalendarClock />} gradient="from-violet-600 to-indigo-800" loading={loading} />
      <AppStatCard label="Pending evidence" value={summary.casesWithMissingEvidence || 0} detail="Cases with an open evidence gap" icon={<FileText />} gradient="from-amber-700 to-orange-800" href="/lawyer/cases" loading={loading} />
      <AppStatCard label="AI analyses" value={agentActivity.length} detail="Recent agent activity" icon={<Sparkles />} gradient="from-cyan-700 to-teal-800" loading={loading} />
      <AppStatCard label="Guardian requests" value={pendingRequests} detail="Related recent notifications" icon={<HeartHandshake />} gradient="from-fuchsia-700 to-violet-800" loading={loading} />
      <AppStatCard label="Notifications" value={unread} detail={unread ? 'Unread updates to review' : 'You are all caught up'} icon={<Bell />} gradient="from-emerald-700 to-teal-800" loading={loading} />
    </section>

    <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,.9fr)]">
      <div className="min-w-0 space-y-5">
        <AppSection title="Recent cases" eyebrow="Your portfolio" action={<Link to="/lawyer/cases" className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-900">All cases <ChevronRight className="size-4" /></Link>}>
          {!cases.length ? <EmptyMessage icon={<Scale />} title="No matters yet" copy="Create a case to see your portfolio activity here." action={<Link to="/lawyer/cases/new" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"><Plus className="size-4" />Create a case</Link>} /> : <div className="space-y-2">{cases.slice(0, 5).map(item => <Link key={item.id} to={'/lawyer/cases/' + item.id} className="group flex min-w-0 items-center gap-3 rounded-2xl border border-slate-100 p-3 transition hover:border-blue-200 hover:bg-blue-50/50 sm:gap-4 sm:p-4"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-blue-50 to-violet-100 text-blue-700"><Scale className="size-5" /></span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold text-slate-900 group-hover:text-blue-800">{item.title}</span><span className="mt-1 block truncate font-mono text-[10px] text-slate-500">{item.case_ref} · {item.court || 'Court not set'}</span></span><span className="hidden shrink-0 text-right sm:block"><AppBadge tone={item.open_missing ? 'amber' : item.open_conflicts ? 'rose' : 'green'}>{item.status}</AppBadge><span className="mt-1 block text-[10px] text-slate-500">{item.active_evidence || 0} evidence records</span></span><ArrowRight className="size-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-blue-700" /></Link>)}</div>}
        </AppSection>

        <AppSection title="Upcoming hearings" eyebrow="Calendar" action={<span className="inline-flex items-center gap-1 text-xs text-slate-500"><CalendarClock className="size-4" />{hearings.length} scheduled</span>}>
          {!hearings.length ? <EmptyMessage icon={<CalendarClock />} title="Your calendar is clear" copy="Hearings added to a case will appear here." /> : <div className="space-y-2">{hearings.slice(0, 5).map(item => <Link key={item.id} to={'/lawyer/cases/' + item.id} className="flex items-center gap-3 rounded-xl p-3 transition hover:bg-slate-50"><span className="flex size-12 shrink-0 flex-col items-center justify-center rounded-xl bg-violet-50 text-violet-800"><span className="text-[9px] font-bold uppercase">{new Date(item.next_hearing_at).toLocaleDateString(undefined, { month: 'short' })}</span><span className="text-base font-bold leading-5">{new Date(item.next_hearing_at).getDate()}</span></span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold text-slate-900">{item.title}</span><span className="mt-1 block truncate text-[10px] text-slate-500">{item.case_ref} · {item.next_hearing_type || 'General hearing'}</span></span><span className="shrink-0 text-right text-[10px] font-semibold text-slate-600">{formatDate(item.next_hearing_at)}</span></Link>)}</div>}
        </AppSection>

        <AppSection title="Evidence timeline" eyebrow="Latest activity" action={<span className="inline-flex items-center gap-1 text-xs text-slate-500"><Clock3 className="size-4" />Recent records</span>}>
          {!evidence.length ? <EmptyMessage icon={<FileText />} title="No evidence activity yet" copy="Structured evidence from analyzed case documents will appear here." /> : <ol className="timeline-rail relative space-y-1 border-l-2 border-blue-100 pl-5">{evidence.slice(0, 6).map(item => <li key={item.id} className="relative rounded-xl px-3 py-2"><span className="absolute -left-[1.57rem] top-4 size-2.5 rounded-full border-2 border-white bg-blue-600 ring-2 ring-blue-100" /><div className="flex flex-wrap items-center justify-between gap-1"><span className="font-mono text-[10px] font-bold text-blue-800">{item.evidence_ref}</span><span className="text-[10px] text-slate-400">{formatDateTime(item.created_at)}</span></div><p className="mt-1 text-xs font-semibold text-slate-800">{item.fact_label}</p><p className="mt-1 line-clamp-2 text-[11px] leading-5 text-slate-600">{item.fact_text}</p></li>)}</ol>}
        </AppSection>
      </div>

      <aside className="min-w-0 space-y-5">
        <AppSection title="AI insights" eyebrow="Evidence-aware" >
          <div className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-cyan-50 p-4"><span className="grid size-10 place-items-center rounded-xl bg-indigo-600 text-white shadow-lg shadow-indigo-700/20"><Lightbulb className="size-5" /></span><p className="mt-3 text-sm font-semibold leading-6 text-slate-900">{insight}</p><p className="mt-2 text-[11px] leading-5 text-slate-600">Suggestions draw from saved case records. Verify cited evidence before acting.</p></div>
          {nextCase && <Link to={'/lawyer/cases/' + nextCase.id + '?tab=ask'} className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-white px-4 text-xs font-semibold text-indigo-800 transition hover:bg-indigo-50">Open Ask the Case <ArrowRight className="size-4" /></Link>}
        </AppSection>

        <AppSection title="Notifications" eyebrow="Updates" action={<AppBadge tone={unread ? 'blue' : 'green'}>{unread} unread</AppBadge>}>
          {!notifications.length ? <EmptyMessage icon={<Bell />} title="No new updates" copy="Case events and hearing reminders will appear here." /> : <div className="space-y-1">{notifications.slice(0, 4).map((item, index) => <div key={item.id || index} className="flex gap-3 rounded-xl p-2.5"><span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-700"><Bell className="size-4" /></span><div className="min-w-0"><p className="text-xs font-semibold text-slate-900">{item.title}</p><p className="mt-1 line-clamp-2 text-[10px] leading-4 text-slate-600">{item.body}</p></div></div>)}</div>}
        </AppSection>

        <AppSection title="System health" eyebrow="Workspace status">
          <div className="space-y-3">{[['Database', health?.database?.ok, health?.database?.latencyMs != null ? health.database.latencyMs + ' ms response' : 'Checking connection'], ['Evidence storage', health?.uploads?.ok, health?.uploads?.ok ? 'Ready for uploads' : 'Needs attention'], ['Grounded AI', true, health?.ai?.fallback || 'Evidence-linked analysis']].map(([label, ok, detail]) => <div key={String(label)} className="flex items-center gap-3"><span className={'grid size-8 place-items-center rounded-lg ' + (ok ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800')}><CheckCircle2 className="size-4" /></span><span className="min-w-0 flex-1"><span className="block text-xs font-semibold text-slate-800">{label}</span><span className="block truncate text-[10px] text-slate-500">{detail}</span></span><span className={'size-2 rounded-full ' + (ok === undefined ? 'bg-slate-300' : ok ? 'bg-emerald-500' : 'bg-amber-500')} /></div>)}</div>
          <Link to="/lawyer/system" className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-900">View operations <ArrowRight className="size-3.5" /></Link>
        </AppSection>

        <AppSection title="Quick actions" eyebrow="Get things done">
          <div className="grid grid-cols-2 gap-2">{quickActions.map(action => { const Icon = action.icon; const content = <><span className={'grid size-9 place-items-center rounded-xl ' + action.tint}><Icon className="size-4" /></span><span className="mt-2 block text-xs font-bold text-slate-900">{action.label}</span><span className="mt-0.5 block text-[10px] leading-4 text-slate-500">{action.hint}</span></>; return action.href ? <a key={action.label} href={action.href} className="group rounded-2xl border border-slate-200 p-3 transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md">{content}</a> : <Link key={action.label} to={action.to} className="group rounded-2xl border border-slate-200 p-3 transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md">{content}</Link>; })}</div>
        </AppSection>
      </aside>
    </div>
    <p className="flex items-center justify-center gap-2 pb-2 text-center text-[10px] text-slate-500"><ShieldCheck className="size-3.5" /> CaseLens keeps case analysis linked to saved evidence and counsel review.</p>
  </div>;
};

const EmptyMessage: React.FC<{ icon: React.ReactNode; title: string; copy: string; action?: React.ReactNode }> = ({ icon, title, copy, action }) => <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-7 text-center"><span className="mx-auto grid size-10 place-items-center rounded-xl bg-white text-slate-400 shadow-sm [&_svg]:size-5">{icon}</span><p className="mt-3 text-xs font-semibold text-slate-800">{title}</p><p className="mx-auto mt-1 max-w-xs text-[11px] leading-5 text-slate-500">{copy}</p>{action && <div className="mt-4">{action}</div>}</div>;
