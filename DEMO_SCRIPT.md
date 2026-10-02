# CaseLens Hackathon Demo Script & Verification Guide

This script demonstrates the core thesis of CaseLens:
> **"Evidence changes the case state, and the agent changes its reasoning accordingly."**

---

## 1. Initial State & Clean Slate
1. Open the application landing screen at `http://localhost:3000`.
2. Notice the two distinct legal portals:
   - **Advocate / Legal Counsel**
   - **Guardian / Individual Client**
3. Click **"Advocate / Legal Counsel"**.
4. If no cases exist yet, notice the clean empty dashboard with live 0 SQL counts.
5. Click **"Load DEMO CASE"** (or run `npm run seed:demo`).
   - The app seeds a fictional matter: **"DEMO CASE — Commercial Supply & Remittance Dispute"** (`DEMO-2026-xxx`).
   - Notice the prominent yellow **`DEMO CASE — fictional data`** badge displayed across all screens.
   - Initial documents `01_Supply_Contract.txt` and `02_Invoice_INV-2041.txt` are pre-processed to establish the baseline case state (v1 analysis).

---

## 2. Baseline Case State (v1 Analysis)
1. Open the case workspace for the demo case.
2. In the **Overview** tab:
   - Status: `Decision/Assessment Generated` or `Evidence Review`.
   - Current Assessment summary: *"Based on uploaded evidence..."* confirms contract price terms and Invoice INV-2041 totaling **₹2,40,000**.
3. In the **Evidence** tab:
   - Review `E-001` (delivery deadline 10 August 2026) and `E-002` (invoice total ₹2,40,000).
   - Click **"View Source"** on any item to open the side-by-side grounded document viewer highlighting the exact verbatim quote in the original text.

---

## 3. Step 1: Uploading Factual Claim (Missing Evidence Trigger)
1. Go to the **Documents** tab.
2. Click to download `03_Email_Payment_Claim.txt` from the **System & Status** page or select it from `server/src/seed/demo-docs/03_Email_Payment_Claim.txt`.
3. Upload `03_Email_Payment_Claim.txt` into the case.
4. Watch the live **PipelineStepper**:
   - `Uploading -> Extracting -> Structuring -> Validating -> Checking conflicts -> Updating case state -> Generating analysis -> Done`
5. Navigate to the **Missing Evidence** tab:
   - Item `M-001` appears: **"Official payment receipt or bank transaction record"**.
   - Rationale: *"Payment confirmation is not present in the uploaded evidence. (Asserted in email: 'payment was completed')".*
   - Status changes to `Missing Evidence`.
6. Navigate to **Case Evolution**:
   - Notice Version **v2** added to the immutable history with the evolution diff.

---

## 4. Step 2: Uploading Inconsistent Bank Record (Conflict Trigger)
1. In the **Documents** tab, upload `04_Payment_Record.pdf` (or `04_Payment_Record.txt`).
2. Watch the live pipeline run and update persistent agent memory.
3. Switch to the **Conflicts** tab:
   - Real conflict **C-001: Amount Mismatch** is detected!
   - Comparison:
     - **Evidence A:** `E-002` (Invoice Total INV-2041): **₹2,40,000**
     - **Evidence B:** `E-004` (Apex Bank Transfer): **₹1,80,000**
     - Severity: **High** (Substantial variance > 15% discrepancy).
     - Why it matters: *"The records contain inconsistent payment information regarding the amount invoiced versus the amount recorded as received."*
4. Switch to **AI Reasoning**:
   - Finding `F-INV-PAY-MISMATCH` highlights the discrepancy citing both evidence IDs.
   - Status indicator shows: `Conflict Detected` · `Human review required`.
   - Missing evidence item `M-001` is marked satisfied/updated.

---

## 5. Step 3: Uploading Delayed Delivery Record (Date Mismatch Trigger)
1. In the **Documents** tab, upload `05_Delivery_Record.pdf` (or `05_Delivery_Record.txt`).
2. Conflict **C-002: Date Mismatch** emerges:
   - Contract promised delivery by **10 August 2026** (`E-001`).
   - Logistics Challan records arrival on **17 August 2026** (`E-005`).
   - Severity: **High** (Actual delivery occurred 7 days after contractual deadline).
   - Case evolution records Version **v4**.

---

## 6. Step 4: Human-in-the-Loop Correction & Re-Analysis
1. Go to the **Evidence** tab.
2. Locate the payment record evidence `E-004` (or any item).
3. Click **"Correct"**.
4. The 5-step Human Correction Modal opens:
   - Field to correct: **Monetary Amount**
   - Original value: `₹1,80,000`
   - Corrected value: enter `₹2,40,000` (e.g. counsel verifying a supplemental bank credit slip).
   - Reason: *"Counsel confirmed supplemental RTGS slip of ₹60,000 discharged the balance in full."*
5. Click **"Apply Correction & Trigger Re-analysis"**:
   - Original evidence item is struck through and labeled `[Superseded by human correction]`.
   - New corrected evidence row is inserted with counsel authorship.
   - Background worker immediately re-evaluates deterministic rules:
     - Amount mismatch conflict **C-001** automatically transitions to **`Resolved by Correction`**!
   - Version **v5** is created in **Case Evolution** showing before/after diffs.

---

## 7. Step 5: Counsel Accountability Sign-Off
1. Navigate to the **Human Review** tab.
2. Review remaining action items.
3. Click **"Record Formal Case Review Sign-Off"**:
   - Formal audit sign-off is committed to the timeline and immutable audit log.

---

## 8. Step 6: Client & Guardian Portal Verification (Restricted DTO)
1. Open an incognito browser window or log out.
2. Select **"Guardian / Individual Client"**.
3. Enter identifier: `guardian@demo.caselens.legal`.
4. Click **"Request Verification Code"**:
   - Dev mode banner appears: *"Development mode: no SMS/email was actually sent. Code: XXXXXX"*.
5. Enter code and submit.
6. Observe the Guardian Portal:
   - Plain-language status: *"Inconsistencies Being Investigated by Lawyer"* or *"Case Initiated"*.
   - **Upcoming Hearing Banner** showing the real hearing date (+9 days).
   - Documents flagged as `shared_with_guardian = 1` are available for download.
   - **Strict Zero-Leak Guarantee:** Confirm that internal notes, AI reasoning traces, conflict breakdowns, missing items lists, and unshared documents are NOT transmitted or visible.
