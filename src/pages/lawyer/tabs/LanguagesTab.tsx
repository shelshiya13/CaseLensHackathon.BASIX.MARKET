import React, { useState, useEffect } from 'react';
import { Languages, RefreshCw } from 'lucide-react';
import { apiRequest } from '../../../lib/api.js';
import { EmptyState } from '../../../components/EmptyState.js';

export const LanguagesTab: React.FC<{ caseId: string; documents: any[]; evidence: any[] }> = ({ caseId, documents, evidence }) => {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pageByDocument, setPageByDocument] = useState<Record<string, number>>({});
  const load = async () => {
    setLoading(true);
    try {
      const res = await apiRequest<{ translations: any[] }>(`/api/cases/${caseId}/translations`);
      setRows(res.translations || []);
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [caseId]);
  const run = async (docId: string) => {
    const pageNo = pageByDocument[docId] || 1;
    setBusy(docId); setError(null);
    try {
      await apiRequest(`/api/cases/${caseId}/translate`, { method: 'POST', body: JSON.stringify({ documentId: docId, pageNo }) });
      await load();
    } catch (e: any) { setError(e.message); } finally { setBusy(null); }
  };
  if (loading) return <div className="h-40 bg-white border rounded-md animate-pulse" aria-busy="true" />;
  return (
    <div className="space-y-5">
      <div className="bg-white p-5 border border-[#E4DFD3] rounded-md flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Languages className="w-5 h-5 text-[#B08D57]" />
          <div>
            <h2 className="text-sm font-semibold text-[#14213D]">Multilingual — EN TA HI TE KN ML MR BN</h2>
            <p className="text-xs text-[#5C5E66]">Gemini when available, deterministic fallback otherwise. Original preserved.</p>
          </div>
        </div>
        <button onClick={load} className="px-3 py-1.5 border rounded text-xs font-medium inline-flex items-center gap-1"><RefreshCw className="w-3.5 h-3.5" />Refresh</button>
      </div>
      {error && <div role="alert" className="p-3 bg-[#FDF2F2] border border-[#F8B4B4] rounded text-sm text-[#9B2C2C]">{error}</div>}
      {documents.length === 0 && <EmptyState title="No documents yet." description="Upload documents to translate." icon={Languages} />}
      {documents.map(d => (
        <div key={d.id} className="bg-white p-5 border border-[#E4DFD3] rounded-md space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-[#14213D]">{d.filename}</span>
            <div className="flex items-center gap-2">
              {d.page_count > 1 && <label className="inline-flex items-center gap-1">Page <select aria-label={`Page for ${d.filename}`} value={pageByDocument[d.id] || 1} onChange={e => setPageByDocument({ ...pageByDocument, [d.id]: Number(e.target.value) })} className="rounded border px-2 py-1">{Array.from({ length: d.page_count }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}</select></label>}
              <button onClick={() => run(d.id)} disabled={busy === d.id} className="px-3 py-1.5 bg-[#14213D] text-white rounded font-semibold disabled:opacity-50">{busy === d.id ? 'Translating…' : `Translate p${pageByDocument[d.id] || 1} to English`}</button>
            </div>
          </div>
          {rows.filter(t => t.document_id === d.id).map(t => (
            <div key={t.id} className="grid md:grid-cols-2 gap-3 text-xs">
              <div className="border rounded p-3"><div className="font-semibold mb-1">Original ({t.source_language})</div><pre className="whitespace-pre-wrap font-mono">{t.original_text.slice(0, 2000)}</pre></div>
              <div className="border rounded p-3 bg-[#FAF7F0]/50"><div className="font-semibold mb-1">English · {t.provider} · {Math.round((t.confidence || 0) * 100)}%</div><pre className="whitespace-pre-wrap">{t.english_text.slice(0, 2000)}</pre></div>
              <div className="md:col-span-2 border rounded p-3"><div className="font-semibold mb-2">Extracted evidence · page {t.page_no}</div>{evidence.filter(item => item.document_id === d.id && Number(item.page_no) === Number(t.page_no)).map(item => <div key={item.id} className="mb-2 rounded border-l-2 border-amber-400 bg-amber-50 p-2"><div className="font-semibold">{item.evidence_ref} · {item.fact_label}</div><p className="mt-1">{item.fact_text}</p>{item.source_quote && <p className="mt-2"><mark className="bg-yellow-200">“{item.source_quote}”</mark></p>}</div>)}{evidence.every(item => item.document_id !== d.id || Number(item.page_no) !== Number(t.page_no)) && <p className="text-[#5C5E66]">No evidence extracted for this page yet.</p>}</div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};
