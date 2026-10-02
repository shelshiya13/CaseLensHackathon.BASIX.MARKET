import React, { useState, useEffect } from 'react';
import {
  Cpu,
  Database,
  Mail,
  FileText,
  Download,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Server
} from 'lucide-react';
import { apiRequest } from '../../lib/api.js';

export const SystemStatusPage: React.FC = () => {
  const [status, setStatus] = useState<any | null>(null);
  const [demoFiles, setDemoFiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [seedMessage, setSeedMessage] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const sRes = await apiRequest('/api/system/status');
      setStatus(sRes.status);

      const fRes = await apiRequest('/api/demo/files');
      setDemoFiles(fRes.files || []);
    } catch (err) {
      console.error('Failed to load system status:', err);
      setLoadError('Could not load platform activity and demo files. Check your connection and server status, then retry.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSeedDemo = async () => {
    setSeeding(true);
    setSeedMessage(null);
    try {
      const res = await apiRequest('/api/demo/load', {
        method: 'POST',
        body: JSON.stringify({})
      });
      setSeedMessage(res.alreadyExists
        ? 'Demo case is ready in your case directory.'
        : 'Demo case created and ready in your case directory.');
      await loadData();
    } catch (err: any) {
      setSeedMessage('The demo case could not be prepared. Please try again.');
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div className="page-enter p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
      <div className="pb-4 border-b border-[#E4DFD3]">
        <h1 className="font-legal-heading text-2xl font-bold text-[#14213D]">
          CaseLens Activity & Resources
        </h1>
        <p className="text-xs text-[#5C5E66] mt-0.5">
          Recent case intelligence activity and materials for exploring the evidence workflow.
        </p>
      </div>

      {loadError && (
        <div role="alert" className="p-3 bg-[#FDF2F2] border border-[#F8B4B4] rounded text-sm text-[#9B2C2C] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <span>{loadError}</span>
          <button type="button" onClick={loadData} disabled={loading} className="self-start sm:self-auto font-semibold underline underline-offset-2 disabled:opacity-50">
            {loading ? 'Retrying...' : 'Retry'}
          </button>
        </div>
      )}

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[.16em] text-[#2563EB]">Case intelligence</p>
            <h2 className="font-legal-heading text-xl font-semibold text-[#14213D]">AI Agent Operations</h2>
          </div>
          <span className="text-[11px] text-[#5C5E66]">Most recent execution across accessible platform activity</span>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {[
            ['adversarial_review', 'Adversarial Review'],
            ['evidence_request', 'Evidence Request'],
            ['hearing_preparation', 'Hearing Preparation']
          ].map(([key, label]) => {
            const agent = status?.caseAgents?.[key];
            const state = agent?.status || 'idle';
            const tone = state === 'completed' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : state === 'fallback' ? 'bg-amber-50 text-amber-800 border-amber-200' : state === 'failed' ? 'bg-rose-50 text-rose-700 border-rose-200' : state === 'running' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-slate-50 text-slate-500 border-slate-200';
            return <div key={key} className="bg-white p-4 border border-[#E4DFD3] rounded-2xl space-y-3">
              <div className="flex items-center justify-between gap-2"><span className="text-sm font-semibold text-[#14213D]">{label}</span><span className={`rounded-full border px-2 py-1 text-[9px] font-bold uppercase ${tone}`}>{state === 'fallback' ? 'ready' : state}</span></div>
              <div className="grid grid-cols-2 gap-2 text-[11px] text-[#5C5E66]"><span>Last run</span><span className="text-right">{agent?.createdAt ? new Date(agent.createdAt).toLocaleString() : 'No runs yet'}</span><span>Duration</span><span className="text-right">{agent?.durationMs != null ? `${agent.durationMs} ms` : '—'}</span></div>
            </div>;
          })}
        </div>
      </section>

      {/* Demo Exhibit Files Download Center */}
      <div className="bg-white p-5 border border-[#E4DFD3] rounded card-brass-top space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-[#E4DFD3]">
            <div className="min-w-0">
            <h2 className="text-sm font-semibold text-[#14213D]">
              Demo Case Exhibit Documents
            </h2>
            <p className="text-xs text-[#5C5E66]">
              Download these real files to test the live document intelligence, conflict detection, and reconciliation workflow.
            </p>
          </div>

          <button
            onClick={handleSeedDemo}
            disabled={seeding}
            className="px-3.5 py-1.5 text-xs font-semibold bg-[#B08D57] hover:bg-[#9B7743] text-white rounded shadow-sm transition-colors inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{seeding ? 'Loading...' : 'Load / Open Demo Case'}</span>
          </button>
        </div>

        {seedMessage && (
          <div role={seedMessage.startsWith('Error:') ? 'alert' : 'status'} className={`p-3 border rounded text-xs font-mono ${seedMessage.startsWith('Error:') ? 'bg-[#FDF2F2] border-[#F8B4B4] text-[#9B2C2C]' : 'bg-[#FAF7F0] border-[#E4DFD3] text-[#14213D]'}`}>
            {seedMessage}
          </div>
        )}

        <div className="divide-y divide-[#E4DFD3]">
          {demoFiles.map(f => (
            <div key={f.filename} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="min-w-0 space-y-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <FileText className="w-4 h-4 text-[#B08D57]" />
                  <span className="font-mono font-bold text-[#14213D] break-all">{f.filename}</span>
                  <span className="text-[10px] text-[#5C5E66] font-mono shrink-0">({(f.size / 1024).toFixed(1)} KB)</span>
                </div>
                <p className="text-[11px] text-[#5C5E66] break-words">{f.description}</p>
              </div>

              <a
                href={`/api/demo/files/${f.filename}`}
                download
                className="self-start sm:self-auto shrink-0 px-3 py-1 bg-white hover:bg-[#FAF7F0] border border-[#E4DFD3] text-[#14213D] rounded font-medium inline-flex items-center gap-1.5 transition-colors"
              >
                <Download className="w-3.5 h-3.5 text-[#B08D57]" />
                <span>Download</span>
              </a>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
