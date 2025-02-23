import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import { modelsRouter } from './routes/models';
import extractRouter from './routes/extract';
import translateRouter from './routes/translate';
import { modelManager } from './services/model-loader';

const app = express();
const port = process.env.PORT || 3001;

// Configuration de multer pour le stockage des fichiers
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Middleware
app.use(cors({
  origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

app.use(express.json());

// Ensure required directories exist
const dirs = ['translations', 'uploads', 'models'];
dirs.forEach(dir => {
  const dirPath = path.join(__dirname, '..', dir);
  if (!require('fs').existsSync(dirPath)) {
    require('fs').mkdirSync(dirPath, { recursive: true });
    console.log(`Created directory: ${dirPath}`);
  }
});

// Initialize model manager
modelManager.initialize().catch(err => {
  console.error('Failed to initialize model manager:', err);
});

// Serve static files
app.use('/translations', express.static(path.join(__dirname, '../translations')));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Routes
app.use('/api', modelsRouter);
app.use('/api', extractRouter);
app.use('/api', translateRouter);

// Health check route
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({
    error: 'Une erreur est survenue',
    details: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Start server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
  console.log('Environment:', process.env.NODE_ENV || 'development');
  console.log('CORS origins:', ['http://localhost:5173', 'http://127.0.0.1:5173']);
  
  // Log available routes
  console.log('\nAvailable routes:');
  app._router.stack.forEach((r: any) => {
    if (r.route && r.route.path) {
      console.log(`${Object.keys(r.route.methods).join(',')} ${r.route.path}`);
    }
  });
});
