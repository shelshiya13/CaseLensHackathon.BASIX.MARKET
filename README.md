# CaseLens — Court & Legal Evidence-Intelligence Platform

> **"Evidence changes the case state, and the agent changes its reasoning accordingly."**

CaseLens is an audit-grade legal case management and evidence-intelligence platform. Uploaded legal documents are converted into grounded, structured evidence, checked for mathematical and chronological conflicts, cross-referenced for corroboration gaps, and analyzed by AI agents that maintain **persistent case state** and **revise their reasoning when evidence changes or a human corrects it**.

---

## Non-Negotiable Core Principles
1. **Zero Fabricated Data:** The database boots completely empty. Counts, court dates, parties, and evidence are computed live via SQL.
2. **No AI Output on Page Open:** AI analysis runs only when a document is processed, when explicitly triggered by counsel, or after a human correction.
3. **Traceability & Grounding:** Every single finding cites specific Evidence IDs (`E-001`) and verbatim source quotes.
4. **Human-in-the-Loop Authority:** Counsel corrections supersede AI extractions and trigger automatic state reconciliation.
5. **No Exposure of Hidden Chains of Thought:** Only concise, structured, auditable reasoning traces are presented.
6. **Strict DTO Isolation for Guardians:** Clients and guardians receive a restricted plain-language portal with zero access to internal notes, AI reasoning, or unshared files.

---

## Architecture Overview

```
caselens/
├─ server.ts                    # Root full-stack Express server + Vite dev middlewares
├─ server/
│  ├─ src/
│  │  ├─ config/env.ts          # Zod-validated environment config & integration health
│  │  ├─ db/                    # SQLite client (sql.js) + migrations runner
│  │  ├─ auth/                  # JWT auth, bcrypt, guardian OTP abstraction
│  │  ├─ access/policy.ts       # Central RBAC capability policy
│  │  ├─ cases/                 # Case management & status derivation engine
│  │  ├─ documents/             # Multi-format text extraction (PDF, DOCX, TXT, OCR) & chunking
│  │  ├─ agents/
│  │  │  ├─ evidenceAgent.ts        # Agent 1: Grounded structured fact extraction
│  │  │  ├─ reconciliationAgent.ts  # Agent 2: Prior state + delta reasoning synthesizer
│  │  │  ├─ timelineAgent.ts        # Deterministic case activity logger
│  │  │  ├─ orchestrator.ts         # End-to-end pipeline coordinator
│  │  │  ├─ state/                  # CaseState canonical model & Omega adapter
│  │  │  └─ rules/                  # Deterministic conflict & requirement engines
│  │  ├─ review/                    # Human correction & re-analysis service
│  │  ├─ notifications/             # Event-driven and hearing reminder service
│  │  ├─ jobs/                      # In-process background worker queue
│  │  └─ seed/                      # Demo case generator & exhibit documents
├─ src/                         # React 18/19 SPA frontend with Tailwind tokens
└─ data/                        # Persistent SQLite database & uploaded documents
```

---

## Environment Variables & Service Integrations

| Key | Service | Where Used | What Happens If Missing? |
| :--- | :--- | :--- | :--- |
| `JWT_SECRET` | Local Auth | Signs and verifies session cookies | Application refuses to boot (required). |
| `OTP_HMAC_SECRET` | Local Auth | Hashes 6-digit client OTPs | Application refuses to boot (required). |
| `DATA_DIR` | Local Disk | Stores `caselens.db` and uploaded files | Defaults to `./data`. |
| `GEMINI_API_KEY` | Google Gemini | Document OCR, structured evidence extraction, reasoning | Text layers are still extracted; deterministic rule engine executes; UI shows *"AI analysis unavailable: GEMINI_API_KEY not configured"* without inventing data. |
| `GEMINI_MODEL` | Google Gemini | Model name for extraction/reasoning | Defaults to `gemini-2.5-flash`. |
| `OMEGA_API_KEY` | Omega State | Agent Without Borders persistent state | Adapter cleanly falls back to SQLite `case_state_store`; UI shows *"Local store (Omega not configured)"*. |
| `OTP_DEV_MODE` | Local Auth | Displays code on screen & console | When `true`, displays a visible yellow dev notice with the code. Never use in production. |
| `SMTP_*` | Nodemailer | Real email OTP delivery | Falls back to dev-console mode. |
| `SMS_WEBHOOK_*` | SMS Gateway | Generic HTTP webhook for SMS | Falls back to dev-console mode. |

---

## Quick Start & Setup

### Prerequisites
- Node.js 20+ installed.

### 1. Installation & Environment Setup
```bash
# Clone the repository
git clone <repo-url>
cd caselens

# Install all dependencies
npm install

# Copy environment template
cp .env.example .env
```

### 2. Run Database Migrations
```bash
npm run migrate
```

### 3. Start Development Server
```bash
npm run dev
```
Open **http://localhost:3000** in your browser. Express serves both the backend REST API and the Vite development frontend.

### 4. Run Automated Test Suite
```bash
npm test
```
Executes Vitest suites testing deterministic conflict rules, Indian currency parsing, quote grounding rejection, case status transitions, and OTP HMAC security.

### 5. Production Build & Start
```bash
npm run build
npm start
```

---

## Verifying Persistent Continuity Across Server Restarts
1. Open a case and observe the version number in **Case Evolution** (e.g. `v3`).
2. Stop the server (`Ctrl+C` in terminal).
3. Restart the server (`npm run dev`).
4. Reopen the case.
5. Notice that all documents, structured evidence, conflicts, and the **Agent Memory** panel remain completely intact. Uploading a new document cleanly computes the delta against the persisted prior state.

---

## Docker Deployment
```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server
COPY --from=builder /app/server.ts ./server.ts

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
VOLUME ["/app/data"]
CMD ["node", "server.ts"]
```
*Note: SQLite requires `/app/data` to be mounted as a persistent volume.*

---

## Security & Responsible-Use Declaration
CaseLens is an AI-assisted analysis tool for legal professionals. It does not replace the counsel of a licensed attorney. All extractions, conflict reports, and reasoning traces must be verified by human counsel before being submitted to any court of law or judicial authority.
