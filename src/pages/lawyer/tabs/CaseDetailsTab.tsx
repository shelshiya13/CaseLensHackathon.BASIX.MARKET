import React, { useState, useEffect } from 'react';
import {
  FileText,
  User,
  Users,
  Shield,
  Trash2,
  Plus,
  Save,
  MessageSquare,
  AlertCircle
} from 'lucide-react';
import { apiRequest } from '../../../lib/api.js';
import { formatDateTime } from '../../../lib/format.js';

interface CaseDetailsTabProps {
  caseId: string;
  caseData: any;
  parties: any[];
  isClosed: boolean;
  onRefresh: () => void;
}

export const CaseDetailsTab: React.FC<CaseDetailsTabProps> = ({
  caseId,
  caseData,
  parties,
  isClosed,
  onRefresh
}) => {
  const [court, setCourt] = useState(caseData.court || '');
  const [caseNumber, setCaseNumber] = useState(caseData.case_number || '');
  const [filingDate, setFilingDate] = useState(caseData.filing_date || '');
  const [nextHearingAt, setNextHearingAt] = useState(caseData.next_hearing_at ? caseData.next_hearing_at.slice(0, 16) : '');
  const [nextHearingType, setNextHearingType] = useState(caseData.next_hearing_type || 'General Hearing');
  const [guardianFriendlyTitle, setGuardianFriendlyTitle] = useState(caseData.guardian_friendly_title || '');
  const [description, setDescription] = useState(caseData.description || '');

  const [savingMetadata, setSavingMetadata] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Guardians
  const [guardians, setGuardians] = useState<any[]>([]);
  const [newGuardianName, setNewGuardianName] = useState('');
  const [newGuardianIdentifier, setNewGuardianIdentifier] = useState('');
  const [newGuardianRole, setNewGuardianRole] = useState('Client Representative');
  const [linkingGuardian, setLinkingGuardian] = useState(false);

  // Internal Notes
  const [notes, setNotes] = useState<any[]>([]);
  const [newNoteBody, setNewNoteBody] = useState('');
  const [submittingNote, setSubmittingNote] = useState(false);

  const loadGuardiansAndNotes = async () => {
    try {
      const gRes = await apiRequest<{ guardians: any[] }>(`/api/cases/${caseId}/guardians`);
      setGuardians(gRes.guardians || []);

      const nRes = await apiRequest<{ notes: any[] }>(`/api/cases/${caseId}/notes`);
      setNotes(nRes.notes || []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadGuardiansAndNotes();
  }, [caseId]);

  const handleSaveMetadata = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isClosed) return;
    setSavingMetadata(true);
    setSaveSuccess(false);

    try {
      await apiRequest(`/api/cases/${caseId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          court,
          caseNumber,
          filingDate,
          nextHearingAt: nextHearingAt || null,
          nextHearingType,
          guardianFriendlyTitle,
          description
        })
      });
      setSaveSuccess(true);
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'Failed to save metadata');
    } finally {
      setSavingMetadata(false);
    }
  };

  const handleLinkGuardian = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGuardianIdentifier.trim() || isClosed) return;
    setLinkingGuardian(true);

    try {
      await apiRequest(`/api/cases/${caseId}/guardians`, {
        method: 'POST',
        body: JSON.stringify({
          name: newGuardianName.trim() || 'Client / Guardian',
          identifier: newGuardianIdentifier.trim(),
          relationshipLabel: newGuardianRole.trim()
        })
      });
      setNewGuardianName('');
      setNewGuardianIdentifier('');
      loadGuardiansAndNotes();
    } catch (err: any) {
      alert(err.message || 'Failed to link guardian');
    } finally {
      setLinkingGuardian(false);
    }
  };

  const handleRemoveGuardian = async (accessId: string) => {
    if (isClosed) return;
    if (!confirm('Revoke portal access for this client?')) return;

    try {
      await apiRequest(`/api/cases/${caseId}/guardians/${accessId}`, { method: 'DELETE' });
      loadGuardiansAndNotes();
    } catch (err: any) {
      alert(err.message || 'Failed to revoke guardian access');
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNoteBody.trim()) return;
    setSubmittingNote(true);

    try {
      await apiRequest(`/api/cases/${caseId}/notes`, {
        method: 'POST',
        body: JSON.stringify({ body: newNoteBody.trim() })
      });
      setNewNoteBody('');
      loadGuardiansAndNotes();
    } catch (err: any) {
      alert(err.message || 'Failed to add note');
    } finally {
      setSubmittingNote(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Metadata Form */}
      <div className="bg-white p-5 border border-[#E4DFD3] rounded card-brass-top space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-[#E4DFD3]">
          <h2 className="text-sm font-semibold text-[#14213D]">
            Court & Forum Metadata
          </h2>
          {saveSuccess && (
            <span className="text-xs text-[#2F6B4F] font-semibold">Changes saved</span>
          )}
        </div>

        <form onSubmit={handleSaveMetadata} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-[#2B2D33] font-medium mb-1">Court / Forum</label>
              <input
                type="text"
                disabled={isClosed}
                value={court}
                onChange={e => setCourt(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-[#E4DFD3] rounded bg-white focus:outline-none focus:border-[#14213D]"
              />
            </div>

            <div>
              <label className="block text-[#2B2D33] font-medium mb-1">Suit / Case Number</label>
              <input
                type="text"
                disabled={isClosed}
                value={caseNumber}
                onChange={e => setCaseNumber(e.target.value)}
                className="w-full px-2.5 py-1.5 font-mono border border-[#E4DFD3] rounded bg-white focus:outline-none focus:border-[#14213D]"
              />
            </div>

            <div>
              <label className="block text-[#2B2D33] font-medium mb-1">Filing Date</label>
              <input
                type="date"
                disabled={isClosed}
                value={filingDate}
                onChange={e => setFilingDate(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-[#E4DFD3] rounded bg-white focus:outline-none focus:border-[#14213D]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[#2B2D33] font-medium mb-1">Next Hearing Date</label>
              <input
                type="datetime-local"
                disabled={isClosed}
                value={nextHearingAt}
                onChange={e => setNextHearingAt(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-[#E4DFD3] rounded bg-white focus:outline-none focus:border-[#14213D]"
              />
            </div>

            <div>
              <label className="block text-[#2B2D33] font-medium mb-1">Hearing Purpose / Type</label>
              <input
                type="text"
                disabled={isClosed}
                value={nextHearingType}
                onChange={e => setNextHearingType(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-[#E4DFD3] rounded bg-white focus:outline-none focus:border-[#14213D]"
              />
            </div>
          </div>

          <div>
            <label className="block text-[#2B2D33] font-medium mb-1">
              Client Portal Friendly Title
            </label>
            <input
              type="text"
              disabled={isClosed}
              value={guardianFriendlyTitle}
              onChange={e => setGuardianFriendlyTitle(e.target.value)}
              className="w-full px-2.5 py-1.5 border border-[#E4DFD3] rounded bg-white focus:outline-none focus:border-[#14213D]"
            />
          </div>

          <div>
            <label className="block text-[#2B2D33] font-medium mb-1">Description / Synopsis</label>
            <textarea
              rows={2}
              disabled={isClosed}
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="w-full px-2.5 py-1.5 border border-[#E4DFD3] rounded bg-white focus:outline-none focus:border-[#14213D]"
            />
          </div>

          {!isClosed && (
            <div className="flex justify-end pt-1">
              <button
                type="submit"
                disabled={savingMetadata}
                className="px-4 py-1.5 bg-[#14213D] text-white rounded font-medium hover:bg-[#1E2D4A] transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{savingMetadata ? 'Saving...' : 'Save Matter Particulars'}</span>
              </button>
            </div>
          )}
        </form>
      </div>

      {/* 2. Client & Guardian Portal Access Management */}
      <div className="bg-white p-5 border border-[#E4DFD3] rounded card-brass-top space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-[#E4DFD3]">
          <div>
            <h2 className="text-sm font-semibold text-[#14213D]">
              Client & Guardian Portal Access ({guardians.length})
            </h2>
            <span className="text-xs text-[#5C5E66]">
              Authorized contacts can log in via OTP to review hearing dates and shared documents.
            </span>
          </div>
        </div>

        {/* Existing Guardians List */}
        <div className="space-y-2">
          {guardians.length === 0 ? (
            <div className="p-4 bg-[#FAF7F0] border border-[#E4DFD3] rounded text-xs text-[#5C5E66] text-center">
              No clients or guardians currently linked to this case.
            </div>
          ) : (
            guardians.map(g => (
              <div key={g.access_id} className="p-3 bg-[#FAF7F0] border border-[#E4DFD3] rounded text-xs flex items-center justify-between">
                <div>
                  <div className="font-semibold text-[#14213D]">{g.name}</div>
                  <div className="text-[11px] text-[#5C5E66] font-mono">
                    {g.email || g.mobile} · Role: {g.relationship_label || 'Client'}
                  </div>
                </div>
                {!isClosed && (
                  <button
                    onClick={() => handleRemoveGuardian(g.access_id)}
                    className="p-1 text-[#9B2C2C] hover:bg-white rounded"
                    title="Revoke client access"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))
          )}
        </div>

        {/* Add Guardian Form */}
        {!isClosed && (
          <form onSubmit={handleLinkGuardian} className="pt-2 border-t border-[#E4DFD3] grid grid-cols-1 md:grid-cols-4 gap-3 text-xs items-end">
            <div>
              <label className="block text-[#5C5E66] mb-1">Contact Name</label>
              <input
                type="text"
                placeholder="e.g. Arun Sharma"
                value={newGuardianName}
                onChange={e => setNewGuardianName(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-[#E4DFD3] rounded bg-white"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-[#5C5E66] mb-1">Email Address or Mobile Number *</label>
              <input
                type="text"
                required
                placeholder="client@company.com or +919876543210"
                value={newGuardianIdentifier}
                onChange={e => setNewGuardianIdentifier(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-[#E4DFD3] rounded bg-white"
              />
            </div>
            <div>
              <button
                type="submit"
                disabled={linkingGuardian}
                className="w-full py-1.5 bg-[#14213D] text-white rounded font-medium hover:bg-[#1E2D4A] transition-colors disabled:opacity-50"
              >
                {linkingGuardian ? 'Linking...' : 'Grant Portal Access'}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* 3. Internal Lawyer Notes (Lawyer-Only) */}
      <div className="bg-white p-5 border border-[#E4DFD3] rounded card-brass-top space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-[#E4DFD3]">
          <div>
            <h2 className="text-sm font-semibold text-[#14213D]">
              Internal Case Notes (Lawyer Eyes Only)
            </h2>
            <span className="text-xs text-[#5C5E66]">
              Confidential attorney work product. Never shared or visible to clients/guardians.
            </span>
          </div>
          <span className="text-xs font-mono text-[#5C5E66]">{notes.length} note(s)</span>
        </div>

        {/* Existing Notes */}
        <div className="space-y-2.5">
          {notes.length === 0 ? (
            <div className="p-4 bg-[#FAF7F0] border border-[#E4DFD3] rounded text-xs text-[#5C5E66] text-center">
              No confidential notes recorded yet.
            </div>
          ) : (
            notes.map(n => (
              <div key={n.id} className="p-3 bg-[#FAF7F0] border border-[#E4DFD3] rounded text-xs space-y-1">
                <div className="flex items-center justify-between text-[11px] text-[#5C5E66]">
                  <span className="font-semibold text-[#14213D]">{n.author_name}</span>
                  <span className="font-mono">{formatDateTime(n.created_at)}</span>
                </div>
                <p className="text-[#2B2D33] whitespace-pre-wrap">{n.body}</p>
              </div>
            ))
          )}
        </div>

        {/* Add Note Form */}
        <form onSubmit={handleAddNote} className="pt-2 border-t border-[#E4DFD3] space-y-2 text-xs">
          <textarea
            rows={2}
            value={newNoteBody}
            onChange={e => setNewNoteBody(e.target.value)}
            placeholder="Record confidential legal strategy, cross-examination notes, or witness notes..."
            className="w-full px-2.5 py-1.5 border border-[#E4DFD3] rounded bg-white focus:outline-none focus:border-[#14213D]"
          />
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={submittingNote || !newNoteBody.trim()}
              className="px-3 py-1.5 bg-[#14213D] text-white rounded font-medium hover:bg-[#1E2D4A] transition-colors disabled:opacity-50"
            >
              {submittingNote ? 'Saving...' : 'Add Confidential Note'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
