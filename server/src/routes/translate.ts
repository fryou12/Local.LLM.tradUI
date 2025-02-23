import { Router } from 'express';
import multer from 'multer';
import { debugLog } from '../utils/logger';
import { TranslationEngine } from '../core/translation-engine';
import { extractTextFromFile } from '../services/text-extractor';
import { checkModelAvailability } from '../services/models';
import * as path from 'path';
import * as fs from 'fs';

const router = Router();

// Créer le dossier uploads s'il n'existe pas
const uploadsDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configuration de multer pour les fichiers PDF uniquement
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

const fileFilter = (req: any, file: any, cb: any) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ext !== '.pdf') {
    cb(new Error('Seuls les fichiers PDF sont acceptés'), false);
  } else {
    cb(null, true);
  }
};

const upload = multer({ 
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB max
  }
});

router.post('/', upload.single('file'), async (req, res) => {
  let filePath: string | undefined;
  
  try {
    debugLog('Début de la requête de traduction');
    debugLog('Body:', req.body);
    debugLog('File:', req.file);

    const { targetLanguage, model } = req.body;
    let sourceText = req.body.text;

    if (!targetLanguage) {
      throw new Error('Langue cible requise');
    }

    if (!model) {
      throw new Error('Modèle requis');
    }

    // Si un fichier est fourni, extraire son texte
    if (req.file) {
      filePath = req.file.path;
      debugLog('Extraction du texte du fichier:', filePath);
      try {
        const extractionResult = await extractTextFromFile(filePath);
        sourceText = extractionResult.text;
        debugLog('Texte extrait avec succès, longueur:', sourceText.length);
      } catch (error) {
        debugLog('Erreur lors de l\'extraction:', error);
        throw error;
      }
    }

    if (!sourceText || sourceText.trim().length === 0) {
      throw new Error('Texte source vide ou non fourni');
    }

    // Vérifier la disponibilité du modèle
    const modelAvailable = await checkModelAvailability(model);
    if (!modelAvailable) {
      throw new Error(`Modèle ${model} non disponible`);
    }

    debugLog('Début de la traduction');
    debugLog('Modèle:', model);
    debugLog('Langue cible:', targetLanguage);
    debugLog('Longueur du texte:', sourceText.length);

    // Configuration du type de réponse pour le streaming
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Créer le moteur de traduction
    const translator = new TranslationEngine();

    // Envoyer un événement de début
    res.write('data: ' + JSON.stringify({ status: 'start', message: 'Début de la traduction' }) + '\n\n');

    // Traduire le texte avec streaming
    try {
      await translator.translateText(sourceText, model, targetLanguage, (chunk) => {
        res.write('data: ' + JSON.stringify({ status: 'success', text: chunk }) + '\n\n');
      });

      // Envoyer un événement de fin
      res.write('data: ' + JSON.stringify({ status: 'end', message: 'Traduction terminée' }) + '\n\n');
      res.end();
    } catch (error) {
      // Envoyer une erreur au client
      res.write('data: ' + JSON.stringify({ 
        status: 'error', 
        error: error instanceof Error ? error.message : 'Erreur de traduction' 
      }) + '\n\n');
      res.end();
    }

  } catch (error) {
    debugLog('Erreur de traduction:', error);
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Erreur de traduction'
    });
  } finally {
    // Nettoyage du fichier temporaire
    if (filePath && fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
        debugLog('Fichier temporaire supprimé:', filePath);
      } catch (error) {
        debugLog('Erreur lors de la suppression du fichier temporaire:', error);
      }
    }
  }
});

export default router;
