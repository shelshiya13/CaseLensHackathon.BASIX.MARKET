export interface PipelineLogContext {
  filename: string;
  documentId: string;
  caseId: string;
  parser: string;
  extractedCharacters: number;
  evidenceCount: number;
  conflictCount: number;
  missingEvidenceCount: number;
  startedAt: number;
  preview?: string;
}

export function logPipelineStage(
  stage: string,
  context: PipelineLogContext,
  details: Record<string, unknown> = {}
): void {
  console.info(`[Pipeline:${stage}]`, JSON.stringify({
    filename: context.filename,
    documentId: context.documentId,
    caseId: context.caseId,
    parser: context.parser,
    extractedCharacters: context.extractedCharacters,
    evidenceCount: context.evidenceCount,
    conflictCount: context.conflictCount,
    missingEvidenceCount: context.missingEvidenceCount,
    executionTimeMs: Date.now() - context.startedAt,
    preview: context.preview?.slice(0, 300) || '',
    ...details
  }));
}
