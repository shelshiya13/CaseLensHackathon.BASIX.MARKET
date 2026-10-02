import React, { useRef, useState } from 'react';
import {
  FileText,
  Upload,
  Download,
  RefreshCw,
  Eye,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Share2,
  X
} from 'lucide-react';
import { apiRequest, apiUpload } from '../../../lib/api.js';
import { formatBytes, formatDateTime } from '../../../lib/format.js';
import { PipelineStepper } from '../../../components/PipelineStepper.js';
import { EmptyState } from '../../../components/EmptyState.js';

interface DocumentsTabProps {
  caseId: string;
  documents: any[];
  isClosed: boolean;
  initialJobIds?: string[];
  onRefresh: () => void;
  onPipelineComplete: () => void;
  onOpenSourceViewer: (eid: string, docId?: string) => void;
}

export const DocumentsTab: React.FC<DocumentsTabProps> = ({
  caseId,
  documents,
  isClosed,
  initialJobIds = [],
  onRefresh,
  onPipelineComplete,
  onOpenSourceViewer
}) => {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [shareWithGuardian, setShareWithGuardian] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reprocessingDocId, setReprocessingDocId] = useState<string | null>(null);
  const [activeJobIds, setActiveJobIds] = useState<string[]>(initialJobIds);
  const completedJobIds = useRef(new Set<string>());

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedFiles.length === 0 || isClosed) return;
    setUploadError(null);
    setUploading(true);
    setUploadProgress(0);

    try {
      const formData = new FormData();
      for (const f of selectedFiles) {
        formData.append('files', f);
      }
      formData.append('shareWithGuardian', String(shareWithGuardian));

      const res = await apiUpload<{ documents: Array<{ docId: string; jobId: string }> }>(
        `/api/cases/${caseId}/documents`,
        formData,
        setUploadProgress
      );

      setSelectedFiles([]);
      setActiveJobIds(res.documents.map(document => document.jobId));
      await onRefresh();
    } catch (err: any) {
      setUploadError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  };

  const handleToggleShare = async (docId: string, currentVal: number) => {
    if (isClosed) return;
    try {
      await apiRequest(`/api/documents/${docId}`, {
        method: 'PATCH',
        body: JSON.stringify({ shared_with_guardian: currentVal === 0 })
      });
      await onRefresh();
    } catch (err: any) {
      setActionError(err.message || 'Failed to update document sharing.');
    }
  };

  const handleReprocess = async (docId: string) => {
    if (isClosed) return;
    setActionError(null);
    setReprocessingDocId(docId);
    try {
      const res = await apiRequest<{ jobId: string }>(`/api/documents/${docId}/reprocess`, {
        method: 'POST'
      });
      if (res.jobId) setActiveJobIds([res.jobId]);
      await onRefresh();
    } catch (err: any) {
      setActionError(err.message || 'Failed to reprocess document.');
    } finally {
      setReprocessingDocId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Active Pipeline Stepper */}
      {activeJobIds.map(jobId => (
        <PipelineStepper
          key={jobId}
          jobId={jobId}
          onComplete={async () => {
            if (completedJobIds.current.has(jobId)) return;
            completedJobIds.current.add(jobId);
            const remainingJobIds = activeJobIds.filter(activeJobId => !completedJobIds.current.has(activeJobId));
            setActiveJobIds(remainingJobIds);
            await onRefresh();
            if (remainingJobIds.length === 0) await onPipelineComplete();
          }}
          onRetry={() => onRefresh()}
        />
      ))}

      {/* Upload Box */}
      {!isClosed && (
        <div className="bg-white p-5 border border-[#E4DFD3] rounded-md shadow-sm card-brass-top space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-[#E4DFD3]">
            <div className="flex items-center gap-2">
              <Upload className="w-4 h-4 text-[#B08D57]" />
              <h2 className="text-sm font-semibold text-[#14213D]">
                Upload Documentary Evidence
              </h2>
            </div>
            <span className="text-xs text-[#5C5E66]">PDF, DOCX, TXT, PNG/JPG (Max 20MB)</span>
          </div>

          {uploadError && (
            <div role="alert" className="p-3 bg-[#FDF2F2] border border-[#F8B4B4] rounded text-xs text-[#9B2C2C] flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{uploadError}</span>
            </div>
          )}

          {actionError && (
            <div role="alert" className="p-3 bg-[#FDF2F2] border border-[#F8B4B4] rounded text-xs text-[#9B2C2C] flex items-center justify-between gap-2">
              <span>{actionError}</span>
              <button type="button" aria-label="Dismiss error" onClick={() => setActionError(null)}><X className="w-4 h-4" /></button>
            </div>
          )}

          <form onSubmit={handleUpload} className="space-y-3.5 text-xs">
            <div
              onDragOver={event => { event.preventDefault(); setDragActive(true); }}
              onDragLeave={event => { if (event.currentTarget === event.target) setDragActive(false); }}
              onDrop={event => {
                event.preventDefault();
                setDragActive(false);
                if (event.dataTransfer.files.length) setSelectedFiles(Array.from(event.dataTransfer.files));
              }}
              className={`border-2 border-dashed rounded-md p-6 text-center transition-colors ${dragActive ? 'border-[#176B68] bg-[#EAF5F3]' : 'border-[#E4DFD3] hover:border-[#14213D] bg-[#FAF7F0]/40'}`}
            >
              <input
                type="file"
                multiple
                id="doc-upload"
                aria-label="Select legal documents to upload"
                accept=".pdf,.docx,.txt,.png,.jpg,.jpeg,application/pdf,text/plain,image/png,image/jpeg"
                className="hidden"
                onChange={e => {
                  if (e.target.files) setSelectedFiles(Array.from(e.target.files));
                }}
              />
              <label htmlFor="doc-upload" className="cursor-pointer">
                <FileText className="w-8 h-8 mx-auto mb-2 text-[#B08D57]" />
                <span className="font-semibold text-[#14213D] hover:underline block">
                  Click to select legal documents
                </span>
                <span className="text-[11px] text-[#5C5E66] block mt-0.5">
                  or drag and drop files directly here
                </span>
              </label>

              {selectedFiles.length > 0 && (
                <div className="mt-3 pt-3 border-t border-[#E4DFD3] text-left">
                  <span className="font-semibold text-[#14213D] block mb-1">Selected files:</span>
                  <ul className="space-y-1.5">
                    {selectedFiles.map((f, i) => (
                      <li key={`${f.name}-${f.size}-${f.lastModified}`} className="text-[#2B2D33] font-mono text-[11px] flex items-center justify-between gap-3 bg-white border border-[#E4DFD3] rounded px-3 py-2">
                        <span>{f.name}</span>
                        <span className="ml-auto text-[#5C5E66] shrink-0">{formatBytes(f.size)}</span>
                        <button type="button" disabled={uploading} aria-label={`Remove ${f.name}`} onClick={() => setSelectedFiles(files => files.filter((_, index) => index !== i))} className="p-1 text-[#5C5E66] hover:text-[#9B2C2C] disabled:opacity-40">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {uploading && uploadProgress != null && (
                <div className="mt-4 text-left" aria-live="polite">
                  <div className="flex justify-between text-[11px] font-medium text-[#2B2D33] mb-1">
                    <span>Uploading documents</span>
                    <span className="font-mono">{uploadProgress}%</span>
                  </div>
                  <div role="progressbar" aria-label="Document upload progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={uploadProgress} className="h-2 w-full overflow-hidden rounded-full bg-[#EDE9DF]">
                    <div className="h-full bg-[#176B68] transition-[width] duration-150" style={{ width: `${uploadProgress}%` }} />
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={shareWithGuardian}
                  onChange={e => setShareWithGuardian(e.target.checked)}
                  className="rounded border-[#E4DFD3] text-[#14213D] focus:ring-0"
                />
                <span className="text-[#2B2D33]">Make visible to client / guardian in portal</span>
              </label>

              <button
                type="submit"
                disabled={uploading || selectedFiles.length === 0}
                className="px-4 py-2 bg-[#14213D] hover:bg-[#1E2D4A] text-white rounded font-semibold transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>{uploading ? 'Uploading documents...' : 'Upload and analyze'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Documents Registry Table */}
      <div className="bg-white border border-[#E4DFD3] rounded-md shadow-sm p-5 space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-[#E4DFD3]">
          <h3 className="text-sm font-semibold text-[#14213D]">
            Case Document Inventory ({documents.length})
          </h3>
          <span className="text-xs text-[#5C5E66] font-mono">SHA-256 Verified Storage</span>
        </div>

        {documents.length === 0 ? (
          <EmptyState
            title="No documents uploaded to this case."
            description="Use the upload area above to attach legal contracts, notices, or scanned exhibits."
            icon={FileText}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#FAF7F0] border-b border-[#E4DFD3] text-[#5C5E66] uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="py-2.5 px-3">Filename</th>
                  <th className="py-2.5 px-3">Pages / Size</th>
                  <th className="py-2.5 px-3">SHA-256 Hash</th>
                  <th className="py-2.5 px-3">Pipeline Status</th>
                  <th className="py-2.5 px-3">Client Portal</th>
                  <th className="py-2.5 px-3">Uploaded</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E4DFD3]">
                {documents.map(d => {
                  const isDone = d.processing_status === 'done';
                  const isFailed = d.processing_status === 'failed';

                  return (
                    <tr key={d.id} className="hover:bg-[#FAF7F0]/60 transition-colors">
                      <td className="py-3 px-3">
                        <div className="font-semibold text-[#14213D] flex items-center gap-1.5">
                          <FileText className="w-3.5 h-3.5 text-[#B08D57]" />
                          <span>{d.filename}</span>
                        </div>
                        <div className="text-[11px] text-[#5C5E66]">{d.doc_type_guess || d.mime}</div>
                        {d.processing_warning && <p role="status" className="mt-1 max-w-sm text-[11px] text-[#8A5A00]">{d.processing_warning}</p>}
                      </td>

                      <td className="py-3 px-3">
                        <span className="font-mono text-[#2B2D33]">{d.page_count} p.</span>
                        <span className="text-[#5C5E66] block text-[11px] font-mono">{formatBytes(d.size_bytes)}</span>
                      </td>

                      <td className="py-3 px-3 font-mono text-[11px] text-[#5C5E66]" title={d.sha256}>
                        {d.sha256.slice(0, 10)}...
                      </td>

                      <td className="py-3 px-3">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono font-medium ${
                            isDone
                              ? 'bg-[#F0FDF4] text-[#2F6B4F] border border-[#BCF0DA]'
                              : isFailed
                              ? 'bg-[#FDF2F2] text-[#9B2C2C] border border-[#F8B4B4]'
                              : 'bg-[#FEFCE8] text-[#B7791F] border border-[#FCE96A]'
                          }`}
                        >
                          {isDone ? (
                            <CheckCircle2 className="w-3 h-3" />
                          ) : isFailed ? (
                            <AlertCircle className="w-3 h-3" />
                          ) : (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          )}
                          <span>{d.processing_status}</span>
                        </span>
                      </td>

                      <td className="py-3 px-3">
                        {!isClosed ? (
                          <button
                            onClick={() => handleToggleShare(d.id, d.shared_with_guardian)}
                            className={`px-2 py-0.5 text-[11px] rounded border transition-colors ${
                              d.shared_with_guardian === 1
                                ? 'bg-[#F0FDF4] text-[#2F6B4F] border-[#BCF0DA]'
                                : 'bg-white text-[#5C5E66] border-[#E4DFD3] hover:bg-[#FAF7F0]'
                            }`}
                          >
                            {d.shared_with_guardian === 1 ? 'Shared' : 'Hidden'}
                          </button>
                        ) : (
                          <span className="text-[11px] text-[#5C5E66]">
                            {d.shared_with_guardian === 1 ? 'Shared' : 'Hidden'}
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-3 text-[#5C5E66] font-mono text-[11px]">
                        {formatDateTime(d.uploaded_at)}
                      </td>

                      <td className="py-3 px-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => onOpenSourceViewer('', d.id)}
                            className="p-1 hover:bg-[#FAF7F0] border border-[#E4DFD3] rounded text-[#14213D]"
                            title="Inspect text extraction"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <a
                            href={`/api/documents/file/${d.id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="p-1 hover:bg-[#FAF7F0] border border-[#E4DFD3] rounded text-[#14213D]"
                            title="Download original file"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </a>
                          {!isClosed && (
                            <button
                              onClick={() => handleReprocess(d.id)}
                              className="p-1 hover:bg-[#FAF7F0] border border-[#E4DFD3] rounded text-[#5C5E66]"
                              title="Reprocess through pipeline"
                            >
                              {reprocessingDocId === d.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
