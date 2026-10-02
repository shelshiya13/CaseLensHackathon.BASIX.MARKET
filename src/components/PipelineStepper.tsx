import React, { useEffect, useState } from 'react';
import { CheckCircle2, Circle, Loader2, AlertCircle, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import { apiRequest } from '../lib/api.js';

export interface StepLog {
  step: string;
  timestamp: string;
  message: string;
}

export interface JobDetails {
  id: string;
  status: 'queued' | 'running' | 'done' | 'failed';
  step: string;
  error?: string | null;
  stepLogs: StepLog[];
}

const PIPELINE_STEPS = [
  { key: 'uploading', label: 'Uploading' },
  { key: 'extracting', label: 'Extracting' },
  { key: 'structuring', label: 'Structuring' },
  { key: 'validating', label: 'Validating' },
  { key: 'checking_conflicts', label: 'Checking conflicts' },
  { key: 'updating_case_state', label: 'Updating case state' },
  { key: 'generating_analysis', label: 'Generating analysis' },
  { key: 'done', label: 'Done' }
];

export const PipelineStepper: React.FC<{
  jobId: string;
  onComplete?: () => void | Promise<void>;
  onRetry?: () => void;
}> = ({ jobId, onComplete, onRetry }) => {
  const [job, setJob] = useState<JobDetails | null>(null);
  const [showLogs, setShowLogs] = useState(false);

  useEffect(() => {
    let timer: any = null;
    let isMounted = true;

    const poll = async () => {
      try {
        const res = await apiRequest<{ job: JobDetails }>(`/api/jobs/${jobId}`);
        if (!isMounted) return;
        setJob(res.job);

        if (res.job.status === 'done') {
          try {
            await onComplete?.();
          } catch (err) {
            console.error('Failed to refresh after pipeline completion:', err);
          }
        } else if (res.job.status === 'failed') {
          // Stopped
        } else {
          timer = setTimeout(poll, 1000);
        }
      } catch (err) {
        console.error('Failed to poll job:', err);
        if (isMounted) timer = setTimeout(poll, 2000);
      }
    };

    poll();

    return () => {
      isMounted = false;
      if (timer) clearTimeout(timer);
    };
  }, [jobId]);

  if (!job) {
    return (
      <div className="p-4 bg-white border border-[#E4DFD3] rounded text-sm flex items-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin text-[#14213D]" />
        <span>Initializing document processing pipeline...</span>
      </div>
    );
  }

  const currentStepIndex = PIPELINE_STEPS.findIndex(s => s.key === job.step);
  const isFailed = job.status === 'failed';
  const isDone = job.status === 'done';

  return (
    <div className="p-4 bg-white border border-[#E4DFD3] rounded card-brass-top">
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-[#E4DFD3]">
        <div className="flex items-center gap-2">
          {isDone ? (
            <CheckCircle2 className="w-5 h-5 text-[#2F6B4F]" />
          ) : isFailed ? (
            <AlertCircle className="w-5 h-5 text-[#9B2C2C]" />
          ) : (
            <Loader2 className="w-5 h-5 text-[#B08D57] animate-spin" />
          )}
          <span className="font-medium text-sm text-[#2B2D33]">
            {isDone
              ? 'Document Intelligence Pipeline Completed'
              : isFailed
              ? 'Pipeline Error'
              : `Processing Step: ${PIPELINE_STEPS[currentStepIndex]?.label || job.step}`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {isFailed && onRetry && (
            <button
              onClick={onRetry}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-[#9B2C2C] text-white rounded hover:bg-[#7E2424]"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Retry</span>
            </button>
          )}
          <button
            onClick={() => setShowLogs(!showLogs)}
            className="text-xs text-[#5C5E66] hover:text-[#2B2D33] inline-flex items-center gap-1"
          >
            <span>{showLogs ? 'Hide details' : 'Show details'}</span>
            {showLogs ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Stepper dots & line */}
      <div className="grid grid-cols-8 gap-1 pt-1">
        {PIPELINE_STEPS.map((step, idx) => {
          const stepDone = isDone || idx < currentStepIndex;
          const stepActive = !isDone && !isFailed && idx === currentStepIndex;
          const stepFail = isFailed && idx === currentStepIndex;

          return (
            <div key={step.key} className="flex flex-col items-center text-center">
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-mono font-medium transition-colors ${
                  stepDone
                    ? 'bg-[#2F6B4F] text-white'
                    : stepActive
                    ? 'bg-[#14213D] text-white ring-2 ring-[#B08D57]'
                    : stepFail
                    ? 'bg-[#9B2C2C] text-white'
                    : 'bg-[#F1F5F9] text-[#64748B] border border-[#CBD5E1]'
                }`}
              >
                {stepDone ? (
                  <CheckCircle2 className="w-4 h-4" />
                ) : stepActive ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  idx + 1
                )}
              </div>
              <span className="text-[11px] mt-1 text-[#5C5E66] leading-tight line-clamp-1">{step.label}</span>
            </div>
          );
        })}
      </div>

      {isFailed && job.error && (
        <div className="mt-3 p-2.5 bg-[#FDF2F2] border border-[#F8B4B4] rounded text-xs text-[#9B2C2C]">
          <strong>Failure reason:</strong> {job.error}
        </div>
      )}

      {showLogs && (
        <div className="mt-3 p-2 bg-[#FAF7F0] border border-[#E4DFD3] rounded text-xs font-mono max-h-40 overflow-y-auto space-y-1">
          {job.stepLogs.length === 0 ? (
            <p className="text-[#5C5E66]">No log messages recorded yet.</p>
          ) : (
            job.stepLogs.map((l, i) => (
              <div key={i} className="text-[#2B2D33] flex gap-2">
                <span className="text-[#5C5E66] shrink-0">{new Date(l.timestamp).toLocaleTimeString()}</span>
                <span className="text-[#B08D57] font-semibold">[{l.step}]</span>
                <span>{l.message}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
