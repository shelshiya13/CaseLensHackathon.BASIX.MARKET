import React, { useState, useEffect } from 'react';
import { ShieldCheck, ScanText } from 'lucide-react';
import { apiRequest } from '../../../lib/api.js';

export const GuardianSummaryTab: React.FC<{ caseId: string; isClosed: boolean }> = ({ caseId, isClosed }) => {
  const [items, setItems] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const load = async () => {
    const res = await apiRequest<{ summaries: any[] }>(`/api/cases/${caseId}/guardian-summaries`);
    setItems(res.summaries || []);
  };
  useEffect(() => { load(); }, [caseId]);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || isClosed) return;
    setSaving(true); setError(null);
    try {
      await apiRequest(`/api/cases/${caseId}/guardian-summaries`, { method: 'POST', body: JSON.stringify({ approvalText: text.trim() }) });
      setText(''); await load();
    } catch (err: any) { setError(err.message); } finally { setSaving(false); }
  };
  return (
    <div className="space-y-4">
      <div className="bg-white p-5 border border-[#E4DFD3] rounded-md">
        <div className="flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-[#B08D57]" />
          <h2 className="text-sm font-semibold text-[#14213D]">Guardian Summary — lawyer approval to Plain EN + Tamil + Hindi</h2></div>
        <p className="text-xs text-[#5C5E66] mt-1">Confidential notes are never exposed. Only your approval text is converted.</p>
        {!isClosed && (
          <form onSubmit={save} className="mt-3 space-y-2">
            <textarea rows={3} value={text} onChange={e => setText(e.target.value)} placeholder="Write the guardian-safe approval, e.g. The next hearing is on 12 August. Please bring the payment receipt."
              className="w-full px-3 py-2 border border-[#E4DFD3] rounded text-sm" />
            <button disabled={saving || !text.trim()} className="px-4 py-2 bg-[#14213D] text-white rounded text-xs font-semibold disabled:opacity-50">{saving ? 'Converting…' : 'Approve + convert'}</button>
          </form>
        )}
      </div>
      {error && <div role="alert" className="p-3 bg-[#FDF2F2] border border-[#F8B4B4] rounded text-sm text-[#9B2C2C]">{error}</div>}
      {items.map(s => (
        <div key={s.id} className="bg-white p-4 border border-[#E4DFD3] rounded-md text-xs space-y-2">
          <div className="font-mono text-[#5C5E66]">{s.created_at} · {s.provider}</div>
          <div><strong>Plain English:</strong> {s.plain_english}</div>
          <div><strong>Tamil:</strong> <span lang="ta">{s.tamil_text}</span></div>
          <div><strong>Hindi:</strong> <span lang="hi">{s.hindi_text}</span></div>
        </div>
      ))}
    </div>
  );
};

export const OcrTab: React.FC<{ documents: any[] }> = ({ documents }) => {
  const [docId, setDocId] = useState('');
  const [ocr, setOcr] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    if (!docId) return;
    setBusy(true); setError(null);
    try {
      const res = await apiRequest<{ ocr: any }>(`/api/documents/${docId}/ocr`, { method: 'POST', body: JSON.stringify({ pageNo: 1 }) });
      setOcr(res.ocr);
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-4">
      <div className="bg-white p-5 border border-[#E4DFD3] rounded-md">
        <div className="flex items-center gap-2"><ScanText className="w-5 h-5 text-[#B08D57]" />
          <h2 className="text-sm font-semibold text-[#14213D]">Handwritten / Phone / Scan OCR — receipts, invoices, signed docs</h2></div>
        <div className="mt-3 flex gap-2 text-xs">
          <select value={docId} onChange={e => setDocId(e.target.value)} className="flex-1 px-2 py-1.5 border rounded bg-white">
            <option value="">Select document…</option>
            {documents.map(d => <option key={d.id} value={d.id}>{d.filename}</option>)}
          </select>
          <button onClick={run} disabled={!docId || busy} className="px-4 py-1.5 bg-[#14213D] text-white rounded font-semibold disabled:opacity-50">{busy ? 'Running…' : 'Run OCR'}</button>
        </div>
      </div>
      {error && <div role="alert" className="p-3 bg-[#FDF2F2] border rounded text-sm text-[#9B2C2C]">{error}</div>}
      {ocr && (
        <div className="bg-white p-5 border border-[#E4DFD3] rounded-md text-xs space-y-2">
          <div className="font-mono">confidence {Math.round((ocr.confidence || 0) * 100)}% · {ocr.method}</div>
          <pre className="whitespace-pre-wrap font-mono bg-[#FAF7F0] border border-[#E4DFD3] rounded p-3">{ocr.rawText || '(no text — upload a transcription)'}</pre>
          {ocr.highlights?.map((h: any, i: number) => (
            <div key={i} className="p-2 bg-[#FEFCE8] border border-[#FCE96A] rounded"><mark className="bg-[#FCE96A]">{h.text}</mark> <span className="font-mono">({Math.round((h.confidence || 0) * 100)}%)</span></div>
          ))}
        </div>
      )}
    </div>
  );
};
