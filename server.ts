import path from 'path';
import fs from 'fs';
import { env } from './server/src/config/env.js';
import { createExpressApp } from './server/src/app.js';
import { runMigrations } from './server/src/db/migrate.js';
import { startBackgroundWorker } from './server/src/jobs/queue.js';
import { checkUpcomingHearingNotifications } from './server/src/notifications/service.js';
import { generateDemoPdfsIfNeeded } from './server/src/seed/demoCase.js';
import { getGeminiApiKey } from './server/src/agents/geminiClient.js';

async function bootstrap() {
  console.log('--- Initializing CaseLens Platform ---');

  // 1. Run SQLite schema migrations
  await runMigrations();

  // 2. Generate demo PDF assets if missing
  try {
    await generateDemoPdfsIfNeeded();
  } catch (err) {
    console.warn('Notice: PDF generation helper encountered non-fatal error:', err);
  }

  // 3. Start background job worker loop
  startBackgroundWorker();

  // 4. Initial check for hearing reminders + schedule hourly
  checkUpcomingHearingNotifications().catch(e => console.error('[Hearing Check Error]', e));
  setInterval(() => {
    checkUpcomingHearingNotifications().catch(e => console.error('[Periodic Hearing Check Error]', e));
  }, 60 * 60 * 1000);

  // 5. Create Express app
  const app = createExpressApp();
  const isProduction = env.NODE_ENV === 'production';

  if (!isProduction) {
    // Development mode: attach Vite middleware
    console.log('[Dev Server] Mounting Vite middlewares...');
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    // Production mode: serve built static files from dist
    console.log('[Production Server] Serving static build from dist/...');
    const distPath = path.resolve('dist');
    if (fs.existsSync(distPath)) {
      const express = (await import('express')).default;
      app.use(express.static(distPath));
      app.get('*', (req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  const port = env.PORT || 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`=======================================================`);
    console.log(` CaseLens Platform running on http://0.0.0.0:${port}`);
    console.log(` Environment: ${env.NODE_ENV}`);
    console.log(` AI Model: ${env.GEMINI_MODEL} (${getGeminiApiKey() ? 'Configured' : 'No API key, rule engine active'})`);
    console.log(` Persistent State: ${env.OMEGA_API_KEY ? 'Omega (Connected)' : 'Local store'}`);
    console.log(`=======================================================`);
  });
}

bootstrap().catch(err => {
  console.error('Fatal initialization error:', err);
  process.exit(1);
});
