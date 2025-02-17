import { Router } from 'express';
import multer from 'multer';
import { debugLog } from '../utils/logger';
import { OCRProcessor } from '../core/ocr-processor';
import { DocumentTranslator } from '../services/document-translator';
import { TranslationEngine } from '../core/translation-engine';
import path from 'path';
import { getModelConfig } from '../services/models';
import fs from 'fs';

const router = Router();
const upload = multer({ dest: 'uploads/' });

// Map pour stocker les sessions de traduction actives
const activeTranslations = new Map<string, {
  translator: DocumentTranslator;
  progress: any;
}>();

const translateText = async (text: string, modelName: string, targetLanguage: string): Promise<string> => {
  debugLog('Starting translation:', { modelName, targetLanguage, textLength: text.length });
  
  try {
    const config = await getModelConfig(modelName);
    const engine = new TranslationEngine(config);
    const result = await engine.translateText(text, modelName, targetLanguage);
    debugLog('Translation completed successfully');
    return result;
  } catch (error) {
    debugLog('Translation failed:', error);
    throw new Error(`Translation failed: ${error.message}`);
  }
};

router.post('/', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Aucun fichier fourni' });
    }

    const selectedModel = req.body.selectedModel;
    const targetLanguage = req.body.targetLanguage || 'French';
    const useOCR = req.body.useOCR === 'true';
    
    if (!selectedModel) {
      return res.status(400).json({ error: 'Aucun modèle sélectionné' });
    }

    // Vérification du type de fichier
    const fileExt = path.extname(req.file.originalname).toLowerCase();
    const supportedFormats = ['.txt', '.pdf'];
    
    if (!supportedFormats.includes(fileExt)) {
      return res.status(400).json({ 
        error: `Format de fichier non supporté: ${fileExt || '(aucune extension)'}. Formats acceptés: ${supportedFormats.join(', ')}` 
      });
    }

    debugLog('=== DÉBUT TRADUCTION ===');
    debugLog(`Fichier: ${req.file.originalname} (${fileExt})`);
    debugLog(`Modèle: ${selectedModel}`);
    debugLog(`Langue cible: ${targetLanguage}`);
    debugLog(`OCR: ${useOCR}`);

    let extractedSegments;
    try {
      // Ensure the uploaded file has the correct extension
      const newPath = req.file.path + fileExt;
      await fs.promises.rename(req.file.path, newPath);
      req.file.path = newPath;
      
      // Extraction du texte avec OCRProcessor
      const ocrProcessor = new OCRProcessor(selectedModel);
      extractedSegments = await ocrProcessor.extractText(req.file.path, useOCR);
      
      if (!extractedSegments || extractedSegments.length === 0) {
        throw new Error('Aucun texte extrait du document');
      }
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }

    const extractedText = extractedSegments.map(segment => segment.text).join('\n\n');

    // 2. Création d'une session de traduction
    const sessionId = Date.now().toString();
    const translator = new DocumentTranslator();
    
    activeTranslations.set(sessionId, {
      translator,
      progress: {
        status: 'starting',
        progress: 0
      }
    });

    // 3. Configuration des événements de progression
    translator.on('progress', (progress) => {
      const session = activeTranslations.get(sessionId);
      if (session) {
        session.progress = progress;
      }
    });

    // 4. Lancement de la traduction en arrière-plan
    translateText(extractedText, selectedModel, targetLanguage).then(async (translatedText) => {
      const session = activeTranslations.get(sessionId);
      if (session) {
        // Save the translated text to a file
        const outputFileName = `${path.parse(req.file.originalname).name}_translated.txt`;
        const outputPath = path.join(__dirname, '../../translations', outputFileName);
        await fs.promises.mkdir(path.join(__dirname, '../../translations'), { recursive: true });
        await fs.promises.writeFile(outputPath, translatedText, 'utf8');
        
        session.progress = {
          status: 'completed',
          progress: 100,
          result: translatedText,
          outputFile: `/translations/${outputFileName}` // Use URL path instead of file system path
        };
      }
    }).catch((error) => {
      const session = activeTranslations.get(sessionId);
      if (session) {
        session.progress = {
          status: 'error',
          error: error.message
        };
      }
    });

    // 5. Retourner l'ID de session au client
    res.json({
      sessionId,
      message: 'Traduction démarrée'
    });

  } catch (error) {
    debugLog('Erreur lors de la traduction:', error);
    res.status(500).json({
      error: 'Erreur lors de la traduction',
      details: error.message
    });
  }
});

// Route pour vérifier la progression d'une traduction
router.get('/progress/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const session = activeTranslations.get(sessionId);

  if (!session) {
    return res.status(404).json({ error: 'Session non trouvée' });
  }

  res.json(session.progress);
});

// Route pour nettoyer une session terminée
router.delete('/session/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  activeTranslations.delete(sessionId);
  res.json({ message: 'Session supprimée' });
});

export default router;
