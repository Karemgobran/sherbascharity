import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { initDatabase } from './server/db.ts';
import { seedDemoDataIfEligible } from './server/demoSeed.ts';
import { donationsAndReceiptsRouter } from './server/routes/donationsAndReceipts.ts';
import { financeAndWarehouseRouter } from './server/routes/financeAndWarehouse.ts';
import { peopleAndRolesRouter } from './server/routes/peopleAndRoles.ts';
import { projectsAndCasesRouter } from './server/routes/projectsAndCases.ts';
import { publicRouter } from './server/routes/public.ts';
import { setupAndAuthRouter } from './server/routes/setupAndAuth.ts';
import { systemAndReportsRouter } from './server/routes/systemAndReports.ts';

async function startServer() {
  initDatabase();
  seedDemoDataIfEligible();

  const app = express();
  const PORT = Number(process.env.PORT || 3000);

  app.set('trust proxy', 1);
  app.use(express.json({ limit: '4mb' }));
  app.use(express.urlencoded({ extended: true }));

  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  // Mount API routes
  app.use('/api', setupAndAuthRouter);
  app.use('/api', publicRouter);
  app.use('/api', peopleAndRolesRouter);
  app.use('/api', donationsAndReceiptsRouter);
  app.use('/api', projectsAndCasesRouter);
  app.use('/api', financeAndWarehouseRouter);
  app.use('/api', systemAndReportsRouter);

  // API 404 fallback
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'نقطة الاتصال المطلوبة غير موجودة' });
  });

  // API error handler (including multer file upload errors)
  app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/api')) {
      const message = err instanceof Error ? err.message : 'حدث خطأ غير متوقع في الخادم';
      return res.status(400).json({ error: message });
    }
    next(err);
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('/{*splat}', (_req, res) => {
      const indexHtml = path.join(distDir, 'index.html');
      if (fs.existsSync(indexHtml)) {
        res.sendFile(indexHtml);
      } else {
        res.status(404).send('Build output not found');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Sherbas Charity Management System running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
