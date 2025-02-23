import express from 'express';
import cors from 'cors';
import { debugLog } from './utils/logger';
import translateRouter from './routes/translate';
import extractRouter from './routes/extract';
import modelsRouter from './routes/models';

const app = express();
const port = process.env.PORT || 3001;

// Middleware pour les logs
app.use((req, res, next) => {
  debugLog(`${req.method} ${req.url}`);
  next();
});

// Configuration CORS
app.use(cors());

// Middleware pour parser le JSON
app.use(express.json());

// Routes
app.use('/api/translate', translateRouter);
app.use('/api/extract-text', extractRouter);
app.use('/api/models', modelsRouter);

// Gestion des erreurs
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  debugLog('Erreur:', err);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Erreur interne du serveur'
  });
});

// Démarrage du serveur
app.listen(port, () => {
  console.log(`Serveur démarré sur le port ${port}`);
});
