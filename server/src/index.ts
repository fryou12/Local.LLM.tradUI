import express from 'express';
import cors from 'cors';
import { debugLog, errorLog } from './utils/logger';
import modelsRouter from './routes/models';
import translateRouter from './routes/translate';

const app = express();
const PORT = parseInt(process.env.PORT || '3002', 10);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use('/translations', express.static('translations'));
app.use('/uploads', express.static('uploads'));

// Logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path} - ${duration}ms`);
  });
  next();
});

// Routes
app.use('/api/models', modelsRouter);
app.use('/api/translate', translateRouter);

// Route de test
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  errorLog('Error:', err);
  res.status(500).json({
    error: err.message || 'Internal Server Error',
    timestamp: new Date().toISOString()
  });
});

// Démarrage du serveur
const server = app.listen(PORT, () => {
  debugLog(`Serveur démarré sur le port ${PORT}`);
});

// Handle server errors
server.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Le port ${PORT} est déjà utilisé. Tentative avec le port ${PORT + 1}`);
    server.listen(PORT + 1);
  } else {
    console.error('Erreur du serveur:', error);
  }
});
