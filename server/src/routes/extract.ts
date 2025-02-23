import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { debugLog } from '../utils/logger';
import pdf from 'pdf-parse';

const router = express.Router();

// Configuration de multer avec stockage sur disque
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(null, false);
      cb(new Error('Seuls les fichiers PDF sont acceptés'));
    }
  }
});

router.post('/', upload.single('file'), async (req, res) => {
  debugLog('Début de l\'extraction de texte');
  debugLog('File:', req.file);
  
  try {
    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        error: 'Aucun fichier fourni ou format non supporté' 
      });
    }

    debugLog('Lecture du fichier PDF');
    const dataBuffer = await fs.promises.readFile(req.file.path);
    
    debugLog('Extraction du texte avec pdf-parse');
    const data = await pdf(dataBuffer);
    
    debugLog('Extraction réussie');
    debugLog('Nombre de pages:', data.numpages);
    debugLog('Taille du texte extrait:', data.text.length);

    // Nettoyage du fichier temporaire
    fs.unlink(req.file.path, (err) => {
      if (err) debugLog('Erreur lors de la suppression du fichier temporaire:', err);
    });

    res.json({ 
      success: true, 
      text: data.text.trim(),
      info: {
        pages: data.numpages,
        metadata: data.metadata,
        version: data.version
      }
    });
  } catch (error) {
    debugLog('Erreur lors de l\'extraction du texte:', error);
    
    // Nettoyage du fichier temporaire en cas d'erreur
    if (req.file) {
      fs.unlink(req.file.path, (err) => {
        if (err) debugLog('Erreur lors de la suppression du fichier temporaire:', err);
      });
    }

    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Erreur lors de l\'extraction du texte du PDF'
    });
  }
});

export default router;
