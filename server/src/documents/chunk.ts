export interface TextChunk {
  chunkIndex: number;
  pageNo: number;
  text: string;
  charStart: number;
  charEnd: number;
}

export function chunkPageText(text: string, pageNo: number, chunkSize = 1200, overlap = 150): TextChunk[] {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  if (normalized.length <= chunkSize) {
    return [
      {
        chunkIndex: 0,
        pageNo,
        text: normalized,
        charStart: 0,
        charEnd: normalized.length
      }
    ];
  }

  const chunks: TextChunk[] = [];
  let start = 0;
  let chunkIndex = 0;

  while (start < normalized.length) {
    let end = Math.min(start + chunkSize, normalized.length);

    // Try to break at newline or sentence/period boundary if not at end
    if (end < normalized.length) {
      const lastBreak = normalized.lastIndexOf('\n', end);
      const lastPeriod = normalized.lastIndexOf('. ', end);
      const chosenBreak = Math.max(lastBreak, lastPeriod);
      if (chosenBreak > start + chunkSize * 0.6) {
        end = chosenBreak + 1;
      }
    }

    const chunkText = normalized.slice(start, end).trim();
    if (chunkText.length > 0) {
      chunks.push({
        chunkIndex,
        pageNo,
        text: chunkText,
        charStart: start,
        charEnd: end
      });
      chunkIndex++;
    }

    start = end - overlap;
    if (start >= normalized.length - overlap) {
      break;
    }
  }

  return chunks;
}
