import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { initFirebase, isReady } from './firebase.js';
import { api } from './routes/api.js';
import { HttpError } from './middleware/auth.js';

initFirebase();

export const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet());

const origins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173').split(',').map((s) => s.trim());
app.use(
  cors({
    origin: (origin, cb) => (!origin || origins.includes(origin) ? cb(null, true) : cb(new HttpError(403, 'Origin not allowed', 'CORS'))),
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 600,
  }),
);
app.use(express.json({ limit: '50kb' }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 600, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many requests', code: 'RATE_LIMITED' } }));

app.get('/health', (_req, res) => res.json({ ok: true, firebase: isReady() }));
app.use('/api', api);

app.use((_req, res) => res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' }));

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, code: err.code });
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON', code: 'VALIDATION' });
  if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'Payload too large', code: 'VALIDATION' });
  console.error('[error]', err?.code || '', err?.message);
  res.status(500).json({ error: 'Something went wrong', code: 'INTERNAL' });
});

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT) || 4000;
  app.listen(port, () => console.log(`MindMesh API listening on :${port}`));
}
