import React, { useState, useEffect } from 'react';
import { ShieldCheck, Hash, RefreshCw, Download, Award, AlertTriangle } from 'lucide-react';
import { apiRequest } from '../../../lib/api.js';

export const TrustTab: React.FC<{ caseId: string; versions: any[] }> = ({ caseId, versions }) => {
  const [integrity, setIntegrity] = useState<any | null>(null);
  const [audit, setAudit] = useState<any | null>(null);
  const [signoffs, setSignoffs] = useState<any[]>([]);
  const [versionNo, setVersionNo] = useState<number>(versions[0]?.version_no || 1);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = async () => {
    try {
      const i = await apiRequest(`/api/cases/${caseId}/integrity`);
      setIntegrity(i);
      const a = await apiRequest(`/api/cases/${caseId}/audit/verify`);
      setAudit(a.verification);
      const s = await apiRequest(`/api/cases/${caseId}/signoffs`);
      setSignoffs(s.signoffs || []);
      setError(null);
    } catch (e: any) { setError(e.message); }
  };
  useEffect(() => { load(); }, [caseId]);
  const sign = async () => {
    setBusy(true); setError(null);
    try {
      await apiRequest(`/api/cases/${caseId}/signoffs`, { method: 'POST', body: JSON.stringify({ versionNo }) });
      await load();
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  const exportPdf = () => { window.open(`/api/cases/${caseId}/export.pdf`, '_blank'); };
  return (
    <div className="space-y-4">
      <div className="bg-white p-5 border rounded-md flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-[#B08D57]" />
          <div><h2 className="text-sm font-semibold">Evidence Integrity · Audit Chain · Version Lock</h2>
          <p className="text-xs text-[#5C5E66]">SHA-256 per file · duplicate + tamper detection · hash-chained audit · signed version lock.</p></div>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="px-3 py-1.5 border rounded text-xs font-medium inline-flex items-center gap-1"><RefreshCw className="w-3.5 h-3.5" />Verify Audit</button>
          <button onClick={exportPdf} className="px-3 py-1.5 bg-[#14213D] text-white rounded text-xs font-semibold inline-flex items-center gap-1"><Download className="w-3.5 h-3.5" />Beautiful PDF</button>
        </div>
      </div>
      {error && <div role="alert" className="p-3 bg-[#FDF2F2] border rounded text-sm">{error}</div>}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-white p-4 border rounded-md text-xs space-y-2">
          <h3 className="font-semibold inline-flex items-center gap-1"><Hash className="w-4 h-4" />SHA-256 integrity {integrity ? (integrity.ok ? '· OK' : '· TAMPER') : ''}</h3>
          {(integrity?.results || []).map((r: any) => (
            <div key={r.documentId} className="font-mono border rounded p-2">{r.filename}: {r.match ? 'MATCH' : 'TAMPER'} {r.actualSha256?.slice(0, 12)}</div>
          ))}
          {(integrity?.duplicates || []).map((d: any) => (
            <div key={d.sha256} className="p-2 bg-[#FEFCE8] border rounded">Duplicate hash {d.sha256.slice(0, 12)} × {d.n}: {d.files}</div>
          ))}
        </div>
        <div className="bg-white p-4 border rounded-md text-xs space-y-2">
          <h3 className="font-semibold">Audit chain {audit ? (audit.ok ? `· VERIFIED (${audit.checked})` : `· BROKEN @ ${audit.brokenAt}`) : ''}</h3>
          <p className="font-mono text-[#5C5E66]">tip {audit?.tip?.slice(0, 16) || '—'}</p>
          <h3 className="font-semibold inline-flex items-center gap-1 pt-2"><Award className="w-4 h-4" />Version lock</h3>
          <div className="flex gap-2">
            <select value={versionNo} onChange={e => setVersionNo(Number(e.target.value))} className="px-2 py-1 border rounded font-mono">
              {versions.map(v => <option key={v.version_no} value={v.version_no}>v{v.version_no}</option>)}
            </select>
            <button onClick={sign} disabled={busy} className="px-3 py-1 bg-[#14213D] text-white rounded font-semibold disabled:opacity-50">{busy ? 'Signing…' : 'Sign + lock'}</button>
          </div>
          {signoffs.map((s: any) => (
            <div key={s.id} className="border rounded p-2 font-mono">v{s.versionNo} {s.status} · {s.signerName} · {s.signedAt}{s.status === 'invalidated' ? ` · INVALID: ${s.invalidateReason}` : ''}</div>
          ))}
          {signoffs.length === 0 && <p className="text-[#5C5E66]">No sign-offs yet. Later edits auto-invalidate locks.</p>}
        </div>
      </div>
      {integrity && !integrity.ok && <div className="p-3 bg-[#FDF2F2] border rounded text-xs inline-flex items-center gap-1"><AlertTriangle className="w-4 h-4" />Tamper detected — re-upload the affected file.</div>}
    </div>
  );
};
