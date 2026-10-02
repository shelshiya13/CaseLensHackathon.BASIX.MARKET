import React, { useState, useEffect } from 'react';
import { BarChart3, RefreshCw, Download } from 'lucide-react';
import { apiRequest } from '../../../lib/api.js';

function useCountUp(target: number, ms = 900): number {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0; const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      setV(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

export function TimelineBars({ data }: { data: Array<{ day: string; evidence: number; events: number }> }) {
  const max = Math.max(1, ...data.map(d => d.evidence + d.events));
  return (
    <div className="flex items-end gap-1 h-28" role="img" aria-label="Timeline chart">
      {data.slice(-20).map(d => (
        <div key={d.day} className="flex-1 flex flex-col justify-end gap-0.5" title={`${d.day}`}>
          <div className="rounded-t transition-all duration-700" style={{ height: `${(d.evidence / max) * 70 + 4}px`, background: '#14213D', opacity: 0.85 }} />
          <div className="rounded-t transition-all duration-700" style={{ height: `${(d.events / max) * 40 + 2}px`, background: '#B08D57', opacity: 0.8 }} />
        </div>
      ))}
    </div>
  );
}

