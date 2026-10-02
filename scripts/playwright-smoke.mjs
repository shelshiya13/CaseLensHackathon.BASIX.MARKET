import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'caselens-playwright-'));
const dataDir = path.join(tempDir, 'data');
const port = await new Promise((resolve, reject) => {
  const probe = net.createServer();
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', () => {
    const address = probe.address();
    probe.close(() => resolve(address.port));
  });
});
const baseUrl = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, [
  path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs'),
  path.join(root, 'server.ts'),
], {
  cwd: root,
  env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, NODE_ENV: 'development' },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let serverOutput = '';
server.stdout.on('data', chunk => { serverOutput += chunk.toString(); });
server.stderr.on('data', chunk => { serverOutput += chunk.toString(); });
let browser;

try {
  let ready = false;
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`App server exited early.\n${serverOutput}`);
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) { ready = true; break; }
    } catch { /* wait for the dev server */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert(ready, `App server did not become ready.\n${serverOutput}`);

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(10_000);
  await page.goto(baseUrl);

  const stamp = Date.now();
  const registration = await context.request.post(`${baseUrl}/api/auth/lawyer/register`, {
    data: { name: 'Playwright Counsel', email: `pw-${stamp}@example.test`, password: 'playwright-pass-123' },
  });
  assert.equal(registration.status(), 200);
  const { token } = await registration.json();
  const auth = { Authorization: `Bearer ${token}` };

  const caseResponse = await context.request.post(`${baseUrl}/api/cases`, {
    headers: auth,
    data: { caseRef: `PW-${stamp}`, title: 'Playwright Verification Matter', caseType: 'Commercial' },
  });
  assert.equal(caseResponse.status(), 200);
  const { caseId } = await caseResponse.json();

  await page.evaluate(value => localStorage.setItem('caselens_token', value), token);
  const viewportWidths = [320, 375, 768, 1024, 1440];
  for (const route of ['/lawyer/dashboard', '/lawyer/cases']) {
    await page.goto(`${baseUrl}${route}`, { waitUntil: 'networkidle' });
    await page.getByRole('main').waitFor();
    for (const width of viewportWidths) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(80);
      const dimensions = await page.evaluate(() => ({ viewport: window.innerWidth, document: document.documentElement.scrollWidth }));
      assert(dimensions.document <= dimensions.viewport + 1, `${route} overflows horizontally at ${width}px: ${JSON.stringify(dimensions)}`);
    }
  }
  await page.goto(`${baseUrl}/auth/guardian`, { waitUntil: 'networkidle' });
  await page.setViewportSize({ width: 320, height: 900 });
  await page.getByRole('heading', { name: 'Welcome back' }).waitFor();
  const guardianInputStyles = await page.getByLabel('Registered email or mobile number').evaluate(input => {
    const style = getComputedStyle(input);
    return { color: style.color, background: style.backgroundColor, caret: style.caretColor };
  });
  assert.equal(guardianInputStyles.color, 'rgb(17, 24, 39)');
  assert.equal(guardianInputStyles.background, 'rgb(255, 255, 255)');
  assert.equal(guardianInputStyles.caret, 'rgb(37, 99, 235)');
  for (const width of viewportWidths) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(80);
    const dimensions = await page.evaluate(() => ({ viewport: window.innerWidth, document: document.documentElement.scrollWidth }));
    assert(dimensions.document <= dimensions.viewport + 1, `Guardian sign-in overflows horizontally at ${width}px: ${JSON.stringify(dimensions)}`);
  }

  const entityResponse = await context.request.post(`${baseUrl}/api/cases/${caseId}/entities/suggest`, {
    headers: auth,
    data: { names: ['FTPL', 'Fictional Traders Pvt Ltd', 'M/s Fictional Traders', 'ABC Ltd', 'ABC Limited', 'ABC Holdings'] },
  });
  assert.equal(entityResponse.status(), 200);
  const suggestedEntities = await entityResponse.json();
  assert(suggestedEntities.clusters?.length >= 2, `Entity suggestions were empty: ${JSON.stringify(suggestedEntities)}`);
  const listedEntities = await context.request.get(`${baseUrl}/api/cases/${caseId}/entities`, { headers: auth });
  assert((await listedEntities.json()).clusters.length >= 2, 'Suggested entity clusters were not persisted.');

  await page.goto(`${baseUrl}/lawyer/cases/${caseId}`, { waitUntil: 'networkidle' });
  await page.getByRole('tab', { name: 'Entities' }).click();
  await page.getByRole('button', { name: 'Refresh' }).click();
  await page.waitForFunction(() => [...document.querySelectorAll('select[aria-label^="Cluster to merge with"] option')]
    .some(option => option.textContent?.includes('ABC')));
  const mergeTarget = page.getByLabel(/Cluster to merge with Fictional Traders/);
  const mergeOptions = await mergeTarget.locator('option').allTextContents();
  assert(mergeOptions.some(option => option.includes('ABC')), `Expected other ABC entity cluster; options were ${JSON.stringify(mergeOptions)}`);
  await mergeTarget.selectOption({ label: mergeOptions.find(option => option.includes('ABC')) });
  await page.getByLabel(/Alias to split from Fictional Traders/).selectOption('FTPL');

  await page.getByRole('tab', { name: 'Guardian Summary' }).click();
  await page.getByPlaceholder(/Write the guardian-safe approval/)
    .fill('The hearing is on 12 August. Please bring the payment receipt.');
  await page.getByRole('button', { name: 'Approve + convert' }).click();
  await page.getByText(/Plain English:/).waitFor();
  await page.getByText(/Tamil:/).waitFor();
  await page.getByText(/Hindi:/).waitFor();

  const upload = await context.request.post(`${baseUrl}/api/cases/${caseId}/documents`, {
    headers: auth,
    multipart: {
      files: {
        name: 'receipt.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('PAYMENT RECEIPT\nBuyer: Fictional Traders Pvt Ltd paid INR 500 on 12 August 2026.\nReceipt signed by buyer.'),
      },
    },
  });
  assert.equal(upload.status(), 200);
  const { documents } = await upload.json();
  const jobId = documents[0].jobId;
  let job;
  for (let attempt = 0; attempt < 120; attempt++) {
    const jobResponse = await context.request.get(`${baseUrl}/api/jobs/${jobId}`, { headers: auth });
    job = (await jobResponse.json()).job;
    if (job.status === 'done') break;
    if (job.status === 'failed') throw new Error(`Document processing failed: ${job.error}`);
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  assert.equal(job?.status, 'done', 'Document evidence pipeline did not finish.');

  await page.goto(`${baseUrl}/lawyer/cases/${caseId}?tab=languages`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /Translate p1 to English/ }).click();
  await page.getByText('Original (en)').waitFor();
  await page.getByText(/Extracted evidence · page 1/).waitFor();
  await page.locator('mark').first().waitFor();

  await page.getByRole('tab', { name: 'OCR' }).click();
  await page.getByRole('combobox').selectOption({ label: 'receipt.txt' });
  await page.getByRole('button', { name: 'Run OCR' }).click();
  await page.getByText(/confidence \d+%/).waitFor();

  const reviewRun = await context.request.post(`${baseUrl}/api/cases/${caseId}/ai-agents/adversarial_review/run`, { headers: auth, data: {} });
  assert.equal(reviewRun.status(), 200);
  const reviewRunBody = await reviewRun.json();
  assert(reviewRunBody.run.payload.findings.every(finding => finding.evidenceRefs.every(ref => /^E-/.test(ref))));
  const hearingRun = await context.request.post(`${baseUrl}/api/cases/${caseId}/ai-agents/hearing_preparation/run`, { headers: auth, data: {} });
  assert.equal(hearingRun.status(), 200);
  const hearingRunBody = await hearingRun.json();
  const briefPdf = await context.request.get(`${baseUrl}/api/cases/${caseId}/ai-agents/runs/${hearingRunBody.run.id}/brief.pdf`, { headers: auth });
  assert.equal(briefPdf.status(), 200);
  assert((await briefPdf.body()).subarray(0, 5).toString() === '%PDF-');
  await page.goto(`${baseUrl}/lawyer/cases/${caseId}?tab=agents`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'AI Agents' }).waitFor();
  await page.getByRole('button', { name: 'Generate hearing brief' }).click();
  await page.getByRole('button', { name: 'Export PDF' }).waitFor();

  console.log('Playwright smoke passed: responsive dashboard, cases, guardian sign-in, input contrast, multilingual extraction, OCR, grounded review, hearing brief versions, and PDF export.');
} catch (error) {
  console.error(error);
  if (serverOutput) console.error(serverOutput);
  process.exitCode = 1;
} finally {
  await browser?.close();
  server.kill();
  await fs.rm(tempDir, { recursive: true, force: true });
}
