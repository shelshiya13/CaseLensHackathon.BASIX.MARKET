import React from 'react';

/** Lightweight, decorative SVG artwork shared by every route. */
export const VisualAtmosphere: React.FC = () => (
  <div className="visual-atmosphere" aria-hidden="true">
    <svg className="atmosphere-art" viewBox="0 0 1440 1000" preserveAspectRatio="xMidYMid slice">
      <defs>
        <radialGradient id="aurora-blue"><stop stopColor="#60a5fa" stopOpacity=".22" /><stop offset="1" stopColor="#60a5fa" stopOpacity="0" /></radialGradient>
        <radialGradient id="aurora-violet"><stop stopColor="#a78bfa" stopOpacity=".18" /><stop offset="1" stopColor="#a78bfa" stopOpacity="0" /></radialGradient>
        <linearGradient id="pillar-ink" x1="0" x2="1" y1="0" y2="1"><stop stopColor="#5275bd" /><stop offset="1" stopColor="#8364c7" /></linearGradient>
        <pattern id="micro-grid" width="36" height="36" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="1" fill="currentColor" />
        </pattern>
      </defs>
      <ellipse cx="1230" cy="90" rx="440" ry="330" fill="url(#aurora-blue)" className="aurora-drift" />
      <ellipse cx="160" cy="850" rx="470" ry="360" fill="url(#aurora-violet)" className="aurora-drift aurora-delay" />
      <rect width="100%" height="100%" fill="url(#micro-grid)" className="atmosphere-dots" />
      <g className="legal-watermark" fill="none" stroke="url(#pillar-ink)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        {/* A quiet courthouse outline, cropped into the upper right edge. */}
        <path d="m1134 227 145-77 145 77h-290Z M1154 244h250 M1167 261v136m48-136v136m64-136v136m48-136v136m48-136v136M1144 411h270m-302 22h334m-305 17h276" />
        <path d="M1172 454h216v20h-216z" opacity=".55" />
      </g>
      <g className="legal-watermark document-mark" fill="none" stroke="url(#pillar-ink)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M110 653h155l52 52v218H110z M265 653v55h52 M145 753h133m-133 34h133m-133 34h92" />
        <path d="m220 869 24 20 47-59" />
      </g>
      <g className="scales-watermark" fill="none" stroke="url(#pillar-ink)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {/* A quiet scales watermark tucked into the far-right negative space. */}
        <path d="M1225 525v172m-52-145h104m-52-37v10m-28 40-28 59h56l-28-59Zm56 0-28 59h56l-28-59Zm-31 123h62m-74 18h86" />
        <path d="M1171 592c8 16 48 16 56 0m0 0c-8 16-48 16-56 0Zm56 0c8 16 48 16 56 0m0 0c-8 16-48 16-56 0Z" opacity=".72" />
      </g>
      <g className="particle-field" fill="currentColor">
        <circle cx="1000" cy="590" r="2.5" /><circle cx="1080" cy="680" r="1.8" />
        <circle cx="1290" cy="580" r="2" /><circle cx="920" cy="770" r="1.7" />
        <circle cx="360" cy="215" r="2" /><circle cx="470" cy="300" r="1.6" />
      </g>
    </svg>
  </div>
);

