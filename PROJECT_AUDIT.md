# Project Audit

**Audit date:** 2026-10-02  
**Scope:** Static review of frontend/backend source, API call-to-route coverage, local SQLite metadata, TODO markers, and available automated checks. No application code was changed.

## 1. Working Features

- Lawyer account registration and password login; guardian OTP request and verification.
- Role-gated lawyer and guardian routes, case dashboards, case creation/details, party and guardian linking, internal notes, case close/reopen, and formal review sign-off.
- Document upload with duplicate hashing, a background processing queue, job progress, and download/sharing controls.
- Text extraction for TXT/Markdown/EML, DOCX, and text-layer PDFs; scanned-PDF and image OCR paths are available when Gemini is configured.
- Evidence extraction with source-quote grounding checks, deterministic conflict and missing-evidence rules, AI-assisted reconciliation when configured, and a deterministic fallback.
- Human correction/review actions, conflict and missing-evidence dismissal, analysis history/compare, case timeline, and persistent local case state.
- Guardian case summary, shared-document access, and filtered guardian-visible updates.
- Notifications, upcoming-hearing checks, system status, and demo case/document utilities.
- Verification completed: `npm test` passed (8 tests), `npm run lint` passed, and `npm run build` succeeded. Build emits a non-blocking warning that `__dirname` is unsupported by Vite's planned native config loader.

Relevant implementation: [server/src/app.ts](server/src/app.ts), [src/routes.tsx](src/routes.tsx), [server/src/agents/orchestrator.ts](server/src/agents/orchestrator.ts).

## 2. Broken Features

- **SMTP email OTP is not actually sent.** `SmtpOtpProvider` logs a message and returns success; the source explicitly leaves real transport unimplemented. Email OTP can therefore appear delivered when no email was transmitted. [server/src/auth/otp/SmtpOtpProvider.ts](server/src/auth/otp/SmtpOtpProvider.ts)
- **Unsafe production defaults are accepted.** JWT and OTP HMAC secrets have development defaults, and OTP dev mode defaults to `true`. With no real OTP provider configured, the dev provider logs the code and can return it in the API response when this flag is enabled. Production startup does not reject these settings. [server/src/config/env.ts](server/src/config/env.ts), [server/src/auth/otp/DevConsoleOtpProvider.ts](server/src/auth/otp/DevConsoleOtpProvider.ts)
- **Image uploads without Gemini do not OCR.** The extractor stores a sentence explaining that OCR needs an API key as if it were extracted page text. The document can proceed as processed without meaningful evidence rather than being explicitly marked unsupported. [server/src/documents/extractText.ts](server/src/documents/extractText.ts)
- **Omega integration is unverified.** Its health/state/event endpoints are marked TODO pending vendor documentation; configured-but-failing calls can fail processing/state operations rather than transparently fall back to local state. [server/src/agents/state/omegaAdapter.ts](server/src/agents/state/omegaAdapter.ts)
- **The production start script is not Windows-compatible as written.** `NODE_ENV=production tsx server.ts` uses POSIX environment assignment syntax; on Windows, use of the documented `npm start` may fail before launching the server. [package.json](package.json)

## 3. Placeholder Pages

No routed page is an obvious placeholder: the role selection, lawyer login/registration, guardian OTP, dashboards, case creation/workspace, system status, and guardian case views have implementations. Case workspace sections are implemented as tabs. Empty-data messages are intentional empty states, not placeholder pages.

## 4. TODO Comments

The only TODO/FIXME/XXX/HACK code comments found are four Omega integration TODOs in [server/src/agents/state/omegaAdapter.ts](server/src/agents/state/omegaAdapter.ts):

- Confirm the health/session verification endpoint.
- Confirm remote session state retrieval.
- Confirm remote session state persistence.
- Confirm the event timeline stream endpoint.

## 5. Missing Backend Endpoints

No missing endpoint was found for the frontend's current `apiRequest` calls; the inspected calls have corresponding backend handlers.

Capabilities absent from the current API include password-reset/account-recovery flows, document deletion/retention management, and account/profile/security administration. These are product omissions rather than broken frontend requests. The app also has no external court-docket or e-filing integration endpoints.

## 6. Missing Frontend Pages

No page appears to be missing from the currently implemented lawyer/guardian flows. There are no dedicated password-reset/recovery, account/profile/security, or administrator/user-management pages, matching the absent backend capabilities above. No court docket/e-filing interface is present.

## 7. AI Features Not Implemented

- No legal-research or case-law/precedent search, legal advice chatbot, court-docket monitoring, or e-filing automation.
- No retrieval-augmented query/search workflow across stored document chunks; chunks are persisted, but the reviewed analysis path passes extracted page evidence into extraction/reconciliation rather than searching a vector index.
- Image OCR requires Gemini. Without it, the current image path does not produce an OCR result.
- Gemini extraction/reasoning is optional. Without a configured key, the app falls back to narrow deterministic heuristics and rules; this is not equivalent to general legal-document analysis.
- External Omega persistence/event synchronization is not verified and should not be represented as production-connected until its API contract is confirmed.

## 8. Authentication Status

Authentication is implemented, but production hardening is incomplete. Lawyer passwords are bcrypt-hashed; sessions are seven-day JWTs delivered in an HTTP-only, SameSite=Lax cookie, with a bearer-token fallback. Guardians authenticate using six-digit OTP challenges stored as HMACs, with expiration, attempt limits, resend cooldown, and in-memory rate limiting. Role and case access checks are present.

Risks and omissions: development secrets and OTP mode are accepted in production; SMTP delivery is a stub; rate-limit state is process-local; lawyer enrolment IDs are self-declared rather than verified; no password recovery or administrative account lifecycle is provided. Logout clears the cookie but JWTs are otherwise stateless and have no server-side revocation list. [server/src/auth/routes.ts](server/src/auth/routes.ts), [server/src/auth/middleware.ts](server/src/auth/middleware.ts)

## 9. Database Status

The application uses `sql.js` with a persistent local SQLite file at `data/caselens.db`. The file exists, and the read-only audit check found migration `001_init.sql` applied on 2026-10-01. The schema covers users, cases/access, documents/pages/chunks, evidence, analysis, review, jobs, notifications, timeline, audit log, and local agent state. Startup runs migrations automatically.

This is suitable for local/demo and single-process use, but mutations export the database file to disk; there is no evidenced backup/restore, multi-instance coordination, or production database operations strategy. Treat the local database and uploaded legal documents as sensitive data.

## 10. Production Readiness Score

**44% (risk-weighted reviewer estimate).** The core application is broad, the local database and migrations work, and test/type/build checks pass. The score is held down by unsafe production authentication defaults, nonfunctional SMTP delivery, unverified Omega calls, weak integration/API test coverage (8 unit tests only), local single-process persistence constraints, and the Windows-incompatible start script. A production launch should be blocked until secrets/OTP behavior and actual email delivery are hardened and tested; deployment, backup, and security controls also need a separate review.
