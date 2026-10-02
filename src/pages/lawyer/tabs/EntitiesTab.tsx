import React, { useState, useEffect } from 'react';
import { Users, RefreshCw } from 'lucide-react';
import { apiRequest } from '../../../lib/api.js';

export const EntitiesTab: React.FC<{ caseId: string; isClosed: boolean; onRefresh: () => void }> = ({ caseId, isClosed, onRefresh }) => {
  const [clusters, setClusters] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mergeTarget, setMergeTarget] = useState<Record<string, string>>({});
  const [splitTarget, setSplitTarget] = useState<Record<string, string>>({});
  const load = async () => {
    setLoading(true);
    try {
      const res = await apiRequest<{ clusters: any[] }>(`/api/cases/${caseId}/entities`);
      setClusters(res.clusters || []);
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [caseId]);
  const suggest = async () => {
    setError(null);
    try { await apiRequest(`/api/cases/${caseId}/entities/suggest`, { method: 'POST', body: JSON.stringify({}) }); await load(); onRefresh(); }
    catch (e: any) { setError(e.message); }
  };
  const review = async (id: string, action: string, extra: any = {}) => {
    setError(null);
    try { await apiRequest(`/api/entities/${id}/review`, { method: 'POST', body: JSON.stringify({ action, ...extra }) }); await load(); }
    catch (e: any) { setError(e.message); }
  };
  if (loading) return <div className="h-40 bg-white border rounded-md animate-pulse" aria-busy="true" />;
  return (
    <div className="space-y-4">
      <div className="bg-white p-5 border border-[#E4DFD3] rounded-md flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-[#B08D57]" />
          <div><h2 className="text-sm font-semibold text-[#14213D]">Entity Resolution</h2>
          <p className="text-xs text-[#5C5E66]">Auto-merged aliases (FTPL, Fictional Traders Pvt Ltd…). Accept, reject, split, merge.</p></div>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="px-3 py-1.5 border rounded text-xs font-medium inline-flex items-center gap-1"><RefreshCw className="w-3.5 h-3.5" />Refresh</button>
          {!isClosed && <button onClick={suggest} className="px-3 py-1.5 bg-[#14213D] text-white rounded text-xs font-semibold">Suggest merges</button>}
        </div>
      </div>
      {error && <div role="alert" className="p-3 bg-[#FDF2F2] border border-[#F8B4B4] rounded text-sm text-[#9B2C2C]">{error}</div>}
      {clusters.map(c => (
        <div key={c.id} className="bg-white p-4 border border-[#E4DFD3] rounded-md text-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-[#14213D]">{c.canonicalName}</span>
            <span className="font-mono text-[#5C5E66]">{c.status}</span>
          </div>
          <div className="text-[#5C5E66]">Aliases: {c.aliases.join(' · ')}</div>
          {!isClosed && (
            <div className="flex flex-wrap gap-2">
              <button onClick={() => review(c.id, 'accept')} className="px-2 py-1 border rounded">Accept</button>
              <button onClick={() => review(c.id, 'reject')} className="px-2 py-1 border rounded">Reject</button>
              <label className="inline-flex items-center gap-1">Split <select aria-label={`Alias to split from ${c.canonicalName}`} value={splitTarget[c.id] ?? c.aliases[0] ?? ''} onChange={e => setSplitTarget({ ...splitTarget, [c.id]: e.target.value })} className="max-w-48 px-2 py-1 border rounded">{c.aliases.map((alias: string) => <option key={alias} value={alias}>{alias}</option>)}</select></label>
              <button onClick={() => review(c.id, 'split', { splitAliases: [splitTarget[c.id] ?? c.aliases[0]] })} disabled={c.aliases.length < 2} className="px-2 py-1 border rounded disabled:opacity-50">Split alias</button>
              <select aria-label={`Cluster to merge with ${c.canonicalName}`} value={mergeTarget[c.id] || ''} onChange={e => setMergeTarget({ ...mergeTarget, [c.id]: e.target.value })} className="max-w-48 px-2 py-1 border rounded"><option value="">Choose entity to merge…</option>{clusters.filter(other => other.id !== c.id).map(other => <option key={other.id} value={other.id}>{other.canonicalName}</option>)}</select>
              <button onClick={() => review(c.id, 'merge', { mergeWithClusterId: mergeTarget[c.id] })} disabled={!mergeTarget[c.id]} className="px-2 py-1 bg-[#14213D] text-white rounded disabled:opacity-50">Merge</button>
            </div>
          )}
        </div>
      ))}
      {clusters.length === 0 && <p className="text-xs text-[#5C5E66] bg-white border border-[#E4DFD3] rounded-md p-4">No entity clusters yet. Click “Suggest merges”.</p>}
    </div>
  );
};
