import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Briefcase, Plus, Trash2, Upload, AlertCircle, ArrowRight, Loader2 } from 'lucide-react';
import { apiRequest, apiUpload } from '../../lib/api.js';

interface PartyRow {
  name: string;
  partyRole: 'client' | 'opposing' | 'other';
  notes: string;
}

export const NewCase: React.FC = () => {
  const navigate = useNavigate();
  const defaultRef = `CASE-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`;

  const [caseRef, setCaseRef] = useState(defaultRef);
  const [title, setTitle] = useState('');
  const [caseType, setCaseType] = useState('Commercial Contract');
  const [court, setCourt] = useState('');
  const [caseNumber, setCaseNumber] = useState('');
  const [filingDate, setFilingDate] = useState('');
  const [nextHearingAt, setNextHearingAt] = useState('');
  const [nextHearingType, setNextHearingType] = useState('Preliminary Hearing');
  const [description, setDescription] = useState('');
  const [guardianFriendlyTitle, setGuardianFriendlyTitle] = useState('');

  // Parties
  const [parties, setParties] = useState<PartyRow[]>([
    { name: '', partyRole: 'client', notes: '' },
    { name: '', partyRole: 'opposing', notes: '' }
  ]);

  // Guardian linking
  const [guardianName, setGuardianName] = useState('');
  const [guardianIdentifier, setGuardianIdentifier] = useState('');
  const [guardianRelationship, setGuardianRelationship] = useState('Client Representative');

  // Files
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdCaseId, setCreatedCaseId] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  const addParty = () => {
    setParties([...parties, { name: '', partyRole: 'other', notes: '' }]);
  };

  const removeParty = (index: number) => {
    setParties(parties.filter((_, i) => i !== index));
  };

  const updateParty = (index: number, field: keyof PartyRow, value: any) => {
    const updated = [...parties];
    updated[index] = { ...updated[index], [field]: value };
    setParties(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    let caseId = createdCaseId;
    try {
      if (!caseId) {
        const validParties = parties.filter(p => p.name.trim().length > 0);
        const res = await apiRequest<{ caseId: string }>('/api/cases', {
          method: 'POST',
          body: JSON.stringify({
            caseRef: caseRef.trim(),
            title: title.trim(),
            caseType,
            court: court.trim() || undefined,
            caseNumber: caseNumber.trim() || undefined,
            filingDate: filingDate || undefined,
            nextHearingAt: nextHearingAt || undefined,
            nextHearingType: nextHearingAt ? nextHearingType : undefined,
            description: description.trim() || undefined,
            guardianFriendlyTitle: guardianFriendlyTitle.trim() || title.trim(),
            parties: validParties,
            guardianName: guardianName.trim() || undefined,
            guardianIdentifier: guardianIdentifier.trim() || undefined,
            guardianRelationship: guardianRelationship.trim() || undefined
          })
        });
        caseId = res.caseId;
        setCreatedCaseId(caseId);
      }

      let initialJobIds: string[] = [];

      // 2. Upload initial files if provided
      if (selectedFiles.length > 0) {
        const formData = new FormData();
        for (const file of selectedFiles) {
          formData.append('files', file);
        }
        setUploadProgress(0);
        const uploadResult = await apiUpload<{ documents: Array<{ jobId: string }> }>(
          `/api/cases/${caseId}/documents`,
          formData,
          setUploadProgress
        );
        initialJobIds = uploadResult.documents.map(document => document.jobId);
      }

      const query = initialJobIds.length > 0
        ? `?tab=documents&jobIds=${initialJobIds.join(',')}`
        : '';
      navigate(`/lawyer/cases/${caseId}${query}`);
    } catch (err: any) {
      setError(caseId
        ? `Case created successfully, but the initial document upload failed: ${err.message || 'Upload failed.'} Retry to upload the selected files without creating a duplicate case.`
        : err.message || 'Failed to create case. Please verify inputs.');
    } finally {
      setLoading(false);
      setUploadProgress(null);
    }
  };

  return (
    <div className="page-enter p-4 sm:p-6 max-w-4xl mx-auto space-y-6">
      <div className="pb-4 border-b border-[#E4DFD3]">
        <h1 className="font-legal-heading text-2xl font-bold text-[#14213D]">Initiate New Legal Matter</h1>
        <p className="text-xs text-[#5C5E66] mt-0.5">
          Establish case identity, parties, schedule, and attach initial documentary evidence.
        </p>
      </div>

      {error && (
        <div role="alert" className="p-3 bg-[#FDF2F2] border border-[#F8B4B4] rounded text-xs text-[#9B2C2C] flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Core Metadata */}
        <div className="bg-white p-5 border border-[#E4DFD3] rounded card-brass-top space-y-4">
          <h2 className="text-sm font-semibold text-[#14213D] pb-2 border-b border-[#E4DFD3]">
            1. Core Case Information
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#2B2D33] mb-1">
                Case ID / Reference <span className="text-[#9B2C2C]">*</span>
              </label>
              <input
                type="text"
                required
                value={caseRef}
                onChange={e => setCaseRef(e.target.value)}
                className="w-full px-3 py-1.5 text-xs font-mono border border-[#E4DFD3] rounded bg-white focus:outline-none focus:border-[#14213D]"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-[#2B2D33] mb-1">
                Formal Case Title <span className="text-[#9B2C2C]">*</span>
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="e.g., Commercial Breach & Balance Recovery Claim"
                className="w-full px-3 py-1.5 text-xs border border-[#E4DFD3] rounded bg-white focus:outline-none focus:border-[#14213D]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#2B2D33] mb-1">Matter / Case Type</label>
              <select
                value={caseType}
                onChange={e => setCaseType(e.target.value)}
                className="w-full px-3 py-1.5 text-xs border border-[#E4DFD3] rounded bg-white focus:outline-none focus:border-[#14213D]"
              >
                <option value="Commercial Contract">Commercial Contract</option>
                <option value="Civil Debt Recovery">Civil Debt Recovery</option>
                <option value="Insolvency & Bankruptcy">Insolvency & Bankruptcy</option>
                <option value="Arbitration Proceedings">Arbitration Proceedings</option>
                <option value="Property & Real Estate">Property & Real Estate</option>
                <option value="Consumer Dispute">Consumer Dispute</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#2B2D33] mb-1">
                Client / Guardian-Friendly Title
              </label>
              <input
                type="text"
                value={guardianFriendlyTitle}
                onChange={e => setGuardianFriendlyTitle(e.target.value)}
                placeholder="Plain language title visible to client in portal"
                className="w-full px-3 py-1.5 text-xs border border-[#E4DFD3] rounded bg-white focus:outline-none focus:border-[#14213D]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#2B2D33] mb-1">Case Description / Synopsis</label>
            <textarea
              rows={2}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Brief context regarding claims, transactional facts, or dispute scope..."
              className="w-full px-3 py-1.5 text-xs border border-[#E4DFD3] rounded bg-white focus:outline-none focus:border-[#14213D]"
            />
          </div>
        </div>

        {/* Court & Hearing Schedule */}
        <div className="bg-white p-5 border border-[#E4DFD3] rounded card-brass-top space-y-4">
          <h2 className="text-sm font-semibold text-[#14213D] pb-2 border-b border-[#E4DFD3]">
            2. Forum, Case Number & Proceedings
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#2B2D33] mb-1">Court / Tribunal / Forum</label>
              <input
                type="text"
                value={court}
                onChange={e => setCourt(e.target.value)}
                placeholder="e.g., District Commercial Court"
                className="w-full px-3 py-1.5 text-xs border border-[#E4DFD3] rounded bg-white focus:outline-none focus:border-[#14213D]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#2B2D33] mb-1">Official Case / Suit Number</label>
              <input
                type="text"
                value={caseNumber}
                onChange={e => setCaseNumber(e.target.value)}
                placeholder="e.g., CS(COMM)/104/2026"
                className="w-full px-3 py-1.5 text-xs font-mono border border-[#E4DFD3] rounded bg-white focus:outline-none focus:border-[#14213D]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#2B2D33] mb-1">Filing Date</label>
              <input
                type="date"
                value={filingDate}
                onChange={e => setFilingDate(e.target.value)}
                className="w-full px-3 py-1.5 text-xs border border-[#E4DFD3] rounded bg-white focus:outline-none focus:border-[#14213D]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <div>
              <label className="block text-xs font-medium text-[#2B2D33] mb-1">Next Hearing Date & Time (Optional)</label>
              <input
                type="datetime-local"
                value={nextHearingAt}
                onChange={e => setNextHearingAt(e.target.value)}
                className="w-full px-3 py-1.5 text-xs border border-[#E4DFD3] rounded bg-white focus:outline-none focus:border-[#14213D]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#2B2D33] mb-1">Hearing Purpose / Type</label>
              <input
                type="text"
                value={nextHearingType}
                onChange={e => setNextHearingType(e.target.value)}
                placeholder="e.g., Framing of Issues, Evidence Hearing"
                className="w-full px-3 py-1.5 text-xs border border-[#E4DFD3] rounded bg-white focus:outline-none focus:border-[#14213D]"
              />
            </div>
          </div>
        </div>

        {/* Case Parties */}
        <div className="bg-white p-5 border border-[#E4DFD3] rounded card-brass-top space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-[#E4DFD3]">
            <h2 className="text-sm font-semibold text-[#14213D]">3. Case Parties</h2>
            <button
              type="button"
              onClick={addParty}
              className="text-xs text-[#B08D57] hover:underline font-medium inline-flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Party</span>
            </button>
          </div>

          <div className="space-y-3">
            {parties.map((p, idx) => (
              <div key={idx} className="flex items-center gap-3 p-2.5 bg-[#FAF7F0] border border-[#E4DFD3] rounded text-xs">
                <div className="flex-1">
                  <input
                    type="text"
                    placeholder="Party Name (e.g. Fictional Traders Pvt Ltd)"
                    value={p.name}
                    onChange={e => updateParty(idx, 'name', e.target.value)}
                    className="w-full px-2.5 py-1 text-xs border border-[#E4DFD3] rounded bg-white focus:outline-none focus:border-[#14213D]"
                  />
                </div>
                <div className="w-36">
                  <select
                    value={p.partyRole}
                    onChange={e => updateParty(idx, 'partyRole', e.target.value)}
                    className="w-full px-2.5 py-1 text-xs border border-[#E4DFD3] rounded bg-white focus:outline-none focus:border-[#14213D]"
                  >
                    <option value="client">Client</option>
                    <option value="opposing">Opposing Party</option>
                    <option value="other">Intervenor / Other</option>
                  </select>
                </div>
                <div className="flex-1">
                  <input
                    type="text"
                    placeholder="Notes (optional representation info)"
                    value={p.notes}
                    onChange={e => updateParty(idx, 'notes', e.target.value)}
                    className="w-full px-2.5 py-1 text-xs border border-[#E4DFD3] rounded bg-white focus:outline-none focus:border-[#14213D]"
                  />
                </div>
                {parties.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeParty(idx)}
                    className="p-1 text-[#9B2C2C] hover:bg-white rounded"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Client / Guardian Access Linking */}
        <div className="bg-white p-5 border border-[#E4DFD3] rounded card-brass-top space-y-4">
          <h2 className="text-sm font-semibold text-[#14213D] pb-2 border-b border-[#E4DFD3]">
            4. Client & Guardian Access Portal Linking (Optional)
          </h2>
          <p className="text-xs text-[#5C5E66]">
            Provide client details to automatically provision OTP access. The client will only view hearing dates and documents explicitly marked as shared.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#2B2D33] mb-1">Client Contact Name</label>
              <input
                type="text"
                value={guardianName}
                onChange={e => setGuardianName(e.target.value)}
                placeholder="e.g., Arun Sharma (Director)"
                className="w-full px-3 py-1.5 text-xs border border-[#E4DFD3] rounded bg-white focus:outline-none focus:border-[#14213D]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#2B2D33] mb-1">
                Client Identifier (Email / Mobile)
              </label>
              <input
                type="text"
                value={guardianIdentifier}
                onChange={e => setGuardianIdentifier(e.target.value)}
                placeholder="client@company.com or +919876543210"
                className="w-full px-3 py-1.5 text-xs border border-[#E4DFD3] rounded bg-white focus:outline-none focus:border-[#14213D]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#2B2D33] mb-1">Relationship Role</label>
              <input
                type="text"
                value={guardianRelationship}
                onChange={e => setGuardianRelationship(e.target.value)}
                placeholder="e.g. Authorized Signatory, Client"
                className="w-full px-3 py-1.5 text-xs border border-[#E4DFD3] rounded bg-white focus:outline-none focus:border-[#14213D]"
              />
            </div>
          </div>
        </div>

        {/* Initial Document Attachments */}
        <div className="bg-white p-5 border border-[#E4DFD3] rounded card-brass-top space-y-4">
          <h2 className="text-sm font-semibold text-[#14213D] pb-2 border-b border-[#E4DFD3]">
            5. Initial Case Documents (Optional)
          </h2>
          <p className="text-xs text-[#5C5E66]">
            Attach contracts, invoices, notices, or scanned records (PDF, DOCX, TXT, PNG/JPG). Uploaded files will be queued for pipeline extraction.
          </p>

          <input
            type="file"
            multiple
            onChange={e => {
              if (e.target.files) {
                setSelectedFiles(Array.from(e.target.files));
              }
            }}
            className="block w-full text-xs text-[#5C5E66] file:mr-4 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-[#14213D] file:text-white hover:file:bg-[#1E2D4A] cursor-pointer"
          />

          {selectedFiles.length > 0 && (
            <div className="p-3 bg-[#FAF7F0] border border-[#E4DFD3] rounded text-xs">
              <span className="font-semibold text-[#14213D]">{selectedFiles.length} file(s) queued for upload:</span>
              <ul className="mt-1 list-disc list-inside text-[#5C5E66]">
                {selectedFiles.map((f, i) => (
                  <li key={i}>{f.name} ({(f.size / 1024).toFixed(0)} KB)</li>
                ))}
              </ul>
            </div>
          )}
          {uploadProgress != null && (
            <div aria-live="polite">
              <div className="flex justify-between text-[11px] font-medium text-[#2B2D33] mb-1">
                <span>Uploading initial documents</span><span className="font-mono">{uploadProgress}%</span>
              </div>
              <div role="progressbar" aria-label="Initial document upload progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={uploadProgress} className="h-2 overflow-hidden rounded-full bg-[#EDE9DF]">
                <div className="h-full bg-[#176B68] transition-[width] duration-150" style={{ width: `${uploadProgress}%` }} />
              </div>
            </div>
          )}
        </div>

        {/* Submit */}
        <div className="flex items-center justify-end gap-3 pt-4">
          <button
            type="button"
            onClick={() => navigate('/lawyer/dashboard')}
            className="px-4 py-2 border border-[#E4DFD3] text-xs font-medium rounded hover:bg-[#FAF7F0] text-[#5C5E66]"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="px-5 py-2 bg-[#14213D] hover:bg-[#1E2D4A] text-white text-xs font-semibold rounded shadow-sm transition-colors disabled:opacity-50 inline-flex items-center gap-2"
          >
            {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            <span>{loading ? (createdCaseId ? 'Uploading Initial Documents...' : 'Creating Case Matter...') : createdCaseId ? 'Retry Initial Upload' : 'Initiate Case & Open Workspace'}</span>
            {!loading && <ArrowRight className="w-3.5 h-3.5" />}
          </button>
        </div>
      </form>
    </div>
  );
};
