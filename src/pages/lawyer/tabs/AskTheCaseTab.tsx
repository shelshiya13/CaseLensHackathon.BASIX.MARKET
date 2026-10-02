import React, { useState } from 'react';
import { apiRequest } from '../../../lib/api.js';
import { AiDisclaimer } from '../../../components/AiDisclaimer.js';
import { Loader2, MessageSquareText, FileDown, Scale, FileQuestion, ClipboardList } from 'lucide-react';

type Mode = 'ask' | 'hearing_brief' | 'counter_argument' | 'document_request';
const labels: Record<string,string> = {
  answer:'Evidence-based answer', case_summary:'Case summary', important_facts:'Important facts', strong_evidence:'Strong evidence', weak_evidence:'Weak evidence', conflicts:'Conflicts', missing_documents:'Missing documents', witness_suggestions:'Witness suggestions', questions_for_client:'Questions for client', questions_for_opposing_counsel:'Questions for opposing counsel', timeline:'Timeline', possible_defence_arguments:'Possible defence arguments', possible_prosecution_arguments:'Possible prosecution arguments', weaknesses:'Weaknesses', risks:'Risks', professional_letter:'Professional letter draft', email:'Email draft', client_checklist:'Client checklist', document_request:'Document request', document:'Document', reason:'Why it is needed'
};
const title = (key:string) => labels[key] || key.replaceAll('_',' ').replace(/^./,s=>s.toUpperCase());

function ResultView({value,depth=0}:{value:any;depth?:number}) {
  if (typeof value === 'string') return <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{value}</p>;
  if (Array.isArray(value)) return <div className="space-y-3">{value.map((item,index)=><div key={index} className="border-l-2 border-blue-200 pl-3"><ResultView value={item} depth={depth+1}/></div>)}</div>;
  if (value && typeof value === 'object') return <div className={depth?'space-y-3':'grid gap-4 md:grid-cols-2'}>{Object.entries(value).map(([key,item])=><section key={key} className="rounded-xl border border-slate-200 bg-white p-4"><h3 className="mb-2 text-sm font-bold text-[#14213D]">{title(key)}</h3><ResultView value={item} depth={depth+1}/></section>)}</div>;
  return null;
}

export const AskTheCaseTab: React.FC<{caseId:string;caseTitle:string}> = ({caseId,caseTitle}) => {
  const [question,setQuestion]=useState('');
  const [result,setResult]=useState<any>(null);
  const [activeMode,setActiveMode]=useState<Mode|null>(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const generate=async(mode:Mode)=>{
    if(loading)return;
    setLoading(true);setError('');setResult(null);setActiveMode(mode);
    try {const response=await apiRequest(`/api/cases/${caseId}/ai/${mode}`,{method:'POST',body:JSON.stringify(mode==='ask'?{question}: {})});setResult(response);}
    catch(e:any){setError(e?.message || (e?.code==='NO_ACTIVE_EVIDENCE' ? 'No evidence is currently available for grounded analysis.' : `Could not prepare ${mode.replaceAll('_',' ')} from this case. Refresh the case and retry.`));}
    finally{setLoading(false);}
  };
  return <div className="space-y-5">
    <style>{'@media print { body * { visibility:hidden!important } #hearing-print, #hearing-print * { visibility:visible!important } #hearing-print { position:absolute; inset:0; width:100%; padding:24px; background:white } .no-print { display:none!important } }'}</style>
    <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-widest text-blue-700">Evidence-grounded case assistant</p><h2 className="mt-1 text-2xl font-bold text-[#14213D]">Ask the Case</h2><p className="mt-2 max-w-3xl text-sm text-slate-600">Answers and drafts use this case’s active evidence only. Each generated statement is checked for a valid E-ref. Unsupported statements are replaced with the evidence limitation.</p></header>
    <AiDisclaimer />
    <section className="no-print rounded-2xl border border-slate-200 bg-white p-5">
      <label htmlFor="case-question" className="block text-sm font-bold text-slate-800">Ask a question about {caseTitle}</label><textarea id="case-question" value={question} onChange={e=>setQuestion(e.target.value)} maxLength={2000} rows={3} placeholder="What evidence supports the payment date?" className="mt-2 w-full rounded-xl border border-slate-300 p-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
      <div className="mt-3 flex flex-wrap gap-2"><button disabled={!question.trim()||loading} onClick={()=>generate('ask')} className="inline-flex items-center gap-2 rounded-lg bg-[#14213D] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"><MessageSquareText size={16}/>{loading&&activeMode==='ask'?'Answering…':'Ask the case'}</button><button disabled={loading} onClick={()=>generate('hearing_brief')} className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"><ClipboardList size={16}/>{loading&&activeMode==='hearing_brief'?'Preparing…':'Generate Hearing Brief'}</button><button disabled={loading} onClick={()=>generate('counter_argument')} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-800 disabled:opacity-50"><Scale size={16}/>Counter arguments</button><button disabled={loading} onClick={()=>generate('document_request')} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-800 disabled:opacity-50"><FileQuestion size={16}/>Next document request</button></div>
    </section>
    {error&&<div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>}
    {loading&&<div className="flex items-center gap-3 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900"><Loader2 className="animate-spin" size={18}/>Building a response from the case evidence…</div>}
    {result&&<section id="hearing-print" className="space-y-4"><header className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-widest text-blue-700">{activeMode==='hearing_brief'?'Hearing preparation':activeMode==='counter_argument'?'Counter argument analysis':activeMode==='document_request'?'Document request drafts':'CaseLens response'}</p><h2 className="mt-1 text-xl font-bold text-[#14213D]">{caseTitle}</h2></div>{activeMode==='hearing_brief'&&<button className="no-print inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold" onClick={()=>window.print()}><FileDown size={16}/>Export to PDF</button>}</header>
      {result.fallbackUsed&&<p className="rounded-xl border border-violet-200 bg-violet-50 p-3 text-sm text-violet-900">Prepared directly from active case evidence. Review each cited source before relying on this draft.</p>}
      {result.lawyerReviewRequired&&<p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900">Lawyer review required. These possible arguments and risks are not legal advice.</p>}
      {result.lawyerApprovalRequired&&<p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900">Draft only — lawyer approval required before sharing or sending.</p>}
      <ResultView value={result.result}/><p className="border-t border-slate-200 pt-3 text-xs text-slate-500">Evidence references identify the source records in this case. AI-generated content requires counsel review.</p></section>}
  </div>;
};
