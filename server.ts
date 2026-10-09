/** Canonical local/Node server entry point. */
import express from 'express';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { createApp } from './server/app.js';

dotenv.config();

const port = Number(process.env.PORT || 3000);

async function startServer() {
  const app = createApp();
  const isProduction = process.env.NODE_ENV === 'production';

  if (isProduction) {
    app.use(express.static('dist', { index: 'index.html' }));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) return next();
      res.sendFile('index.html', { root: 'dist' });
    });
  } else {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Apex Fit server listening on http://localhost:${port}`);
  });
}

startServer().catch((error) => {
  console.error('Failed to start Apex Fit:', error);
  process.exit(1);
});
