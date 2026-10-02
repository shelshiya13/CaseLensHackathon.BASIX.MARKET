import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import PDFDocument from 'pdfkit';
import { getDb } from '../db/client.js';
import { processDocumentPipeline } from '../agents/orchestrator.js';
import { recordTimelineEvent } from '../agents/timelineAgent.js';
import { runMigrations } from '../db/migrate.js';

export async function generateDemoPdfsIfNeeded() {
  const demoDocsDir = path.resolve('server/src/seed/demo-docs');
  if (!fs.existsSync(demoDocsDir)) {
    fs.mkdirSync(demoDocsDir, { recursive: true });
  }

  const textFiles = fs.readdirSync(demoDocsDir).filter(f => f.endsWith('.txt'));

  for (const txtFile of textFiles) {
    const pdfName = txtFile.replace(/\.txt$/, '.pdf');
    const pdfPath = path.join(demoDocsDir, pdfName);

    if (!fs.existsSync(pdfPath)) {
      const textContent = fs.readFileSync(path.join(demoDocsDir, txtFile), 'utf-8');
      await new Promise<void>((resolve, reject) => {
        const doc = new PDFDocument({ margin: 50 });
        const stream = fs.createWriteStream(pdfPath);
        doc.pipe(stream);

        // Header style
        doc.fontSize(16).font('Helvetica-Bold').text('CASELENS LEGAL INTELLIGENCE DEMO RECORD', { align: 'center' });
        doc.moveDown(0.5);
        doc.fontSize(10).font('Helvetica').fillColor('#555555').text('PRODUCED FOR ALPHA DEMONSTRATION & EVIDENCE VERIFICATION', { align: 'center' });
        doc.moveDown(1);
        doc.strokeColor('#B08D57').lineWidth(1).moveTo(50, doc.y).lineTo(550, doc.y).stroke();
        doc.moveDown(1.5);

        // Document Body
        doc.fontSize(11).font('Helvetica').fillColor('#222222').text(textContent, {
          lineGap: 4,
          align: 'left'
        });

        doc.end();
        stream.on('finish', () => resolve());
        stream.on('error', reject);
      });
    }
  }
}

export async function seedDemoCase() {
  await runMigrations();
  await generateDemoPdfsIfNeeded();
  const db = await getDb();

  const existingDemo = db.prepare<any>('SELECT id, case_ref FROM cases WHERE is_demo = 1 ORDER BY created_at ASC LIMIT 1').get();
  if (existingDemo) {
    return {
      success: false,
      caseId: existingDemo.id,
      caseRef: existingDemo.case_ref,
      message: 'Demo case already exists in database.'
    };
  }

  const now = new Date();
  const hearingDate = new Date(now.getTime() + 9 * 24 * 60 * 60 * 1000).toISOString(); // +9 days
  const nowIso = now.toISOString();

  // 1. Ensure Demo Lawyer user exists
  const lawyerEmail = 'lawyer@demo.caselens.legal';
  let lawyer = db.prepare<any>('SELECT id, name FROM users WHERE email = ?').get(lawyerEmail);
  let lawyerId = lawyer?.id;

  if (!lawyer) {
    lawyerId = crypto.randomUUID();
    const hash = await bcrypt.hash('demoLawyer1234!', 10);
    db.prepare(`
      INSERT INTO users (id, role, name, email, password_hash, enrolment_id, created_at)
      VALUES (?, 'lawyer', 'Advocate S. Roy', ?, ?, 'D/2041/2018', ?)
    `).run(lawyerId, lawyerEmail, hash, nowIso);
  }

  // 2. Ensure Demo Guardian user exists
  const guardianEmail = 'guardian@demo.caselens.legal';
  let guardian = db.prepare<any>('SELECT id FROM users WHERE email = ?').get(guardianEmail);
  let guardianId = guardian?.id;

  if (!guardian) {
    guardianId = crypto.randomUUID();
    db.prepare(`
      INSERT INTO users (id, role, name, email, mobile, created_at)
      VALUES (?, 'guardian', 'Arun Sharma (Director)', ?, '+919876543210', ?)
    `).run(guardianId, guardianEmail, nowIso);
  }

  // 3. Create Case
  const caseId = crypto.randomUUID();
  const caseRef = `DEMO-2026-${Math.floor(100 + Math.random() * 900)}`;

  db.prepare(`
    INSERT INTO cases (
      id, case_ref, title, case_type, status, court, case_number,
      filing_date, next_hearing_at, next_hearing_type, assigned_lawyer_id,
      description, guardian_friendly_title, is_demo, created_at, updated_at
    ) VALUES (
      ?, ?, 'DEMO CASE — Commercial Supply & Remittance Dispute',
      'Commercial Contract', 'New', 'Demo District Commercial Court — fictional',
      'CS/2026/819', '2026-06-15', ?, 'Preliminary Evidence Hearing',
      ?, 'Fictional commercial dispute regarding breach of delivery schedule and invoice payment variance.',
      'Supply Contract Commercial Claim', 1, ?, ?
    )
  `).run(caseId, caseRef, hearingDate, lawyerId, nowIso, nowIso);

  // 4. Case Parties
  db.prepare(`
    INSERT INTO case_parties (id, case_id, name, party_role, notes)
    VALUES (?, ?, 'Fictional Traders Pvt Ltd', 'client', 'Commercial Buyer under Contract CTR-2026-889')
  `).run(crypto.randomUUID(), caseId);

  db.prepare(`
    INSERT INTO case_parties (id, case_id, name, party_role, notes)
    VALUES (?, ?, 'Sample Supplies LLP', 'opposing', 'Industrial Component Supplier')
  `).run(crypto.randomUUID(), caseId);

  // 5. Access grants
  db.prepare(`
    INSERT INTO case_access (id, case_id, user_id, access_level, relationship_label, created_at)
    VALUES (?, ?, ?, 'owner_lawyer', 'Lead Counsel', ?)
  `).run(crypto.randomUUID(), caseId, lawyerId, nowIso);

  db.prepare(`
    INSERT INTO case_access (id, case_id, user_id, access_level, relationship_label, created_at)
    VALUES (?, ?, ?, 'guardian_view', 'Client Representative', ?)
  `).run(crypto.randomUUID(), caseId, guardianId, nowIso);

  // 6. Record timeline event
  await recordTimelineEvent({
    caseId,
    eventType: 'case_created',
    description: `Demo case ${caseRef} created by Advocate S. Roy.`,
    actorType: 'lawyer',
    actorId: lawyerId,
    guardianVisible: true
  });

  // 7. Pre-upload initial documents 01 and 02
  const demoDocsDir = path.resolve('server/src/seed/demo-docs');
  const uploadDataDir = path.resolve(process.env.DATA_DIR || './data', 'uploads', caseId);

  const initialDocs = ['01_Supply_Contract.txt', '02_Invoice_INV-2041.txt'];
  for (const docFilename of initialDocs) {
    const srcPath = path.join(demoDocsDir, docFilename);
    if (fs.existsSync(srcPath)) {
      const docId = crypto.randomUUID();
      const destDir = path.join(uploadDataDir, docId);
      fs.mkdirSync(destDir, { recursive: true });
      const destPath = path.join(destDir, docFilename);
      fs.copyFileSync(srcPath, destPath);

      const buffer = fs.readFileSync(destPath);
      const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

      db.prepare(`
        INSERT INTO documents (
          id, case_id, filename, mime, size_bytes, sha256, storage_path,
          doc_type_guess, page_count, shared_with_guardian, uploaded_by,
          uploaded_at, processing_status
        ) VALUES (?, ?, ?, 'text/plain', ?, ?, ?, ?, 1, 1, ?, ?, 'uploaded')
      `).run(
        docId,
        caseId,
        docFilename,
        buffer.length,
        sha256,
        destPath,
        docFilename.includes('Contract') ? 'Contract' : 'Invoice',
        lawyerId,
        new Date().toISOString()
      );

      // Process immediately through pipeline
      const jobId = crypto.randomUUID();
      db.prepare(`
        INSERT INTO jobs (id, case_id, document_id, kind, status, step, step_log_json, created_at)
        VALUES (?, ?, ?, 'process_document', 'running', 'uploading', '[]', ?)
      `).run(jobId, caseId, docId, new Date().toISOString());

      await processDocumentPipeline(jobId, caseId, docId);
    }
  }

  return {
    success: true,
    caseId,
    caseRef,
    lawyerCredentials: { email: lawyerEmail, password: 'demoLawyer1234!' },
    guardianIdentifier: guardianEmail
  };
}

if (process.argv[1]?.includes('demoCase')) {
  seedDemoCase()
    .then(res => {
      console.log('Demo case seeded:', res);
      process.exit(0);
    })
    .catch(err => {
      console.error('Failed to seed demo case:', err);
      process.exit(1);
    });
}
