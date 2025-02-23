import { Router } from 'express';
import multer from 'multer';
import { debugLog } from '../utils/logger';
import { OCRProcessor, OCRTextChunk } from '../core/ocr-processor';
import { DocumentTranslator } from '../services/document-translator';
import { DocumentFormatter } from '../services/document-formatter';
import { TranslationEngine } from '../core/translation-engine';
import path from 'path';
import fs from 'fs';
import { ModelConfig } from '../config/models';
import { ModelLoader } from '../services/model-loader';
import { TranslationProgress } from '../types/translation';

interface SegmentationConfig {
  maxTokens: number;
  optimalChunkSize: number;
  overlapPercentage: number;
  avgCharsPerToken: number;
  preserveMarkup: boolean;
  smartParagraphDetection: boolean;
  contextWindow: number;
  minSegmentLength: number;
}

// Renommer notre interface locale pour éviter les conflits
interface TranslationChunk {
  text: string;
  index: number;
  metadata: {
    pageNumber: number;
    startIndex: number;
    endIndex: number;
  };
}

// Map des codes de langue vers leurs noms complets
const LANGUAGE_CODES: { [key: string]: string } = {
  'fr': 'French',
  'en': 'English',
  'es': 'Spanish',
  'de': 'German',
  'it': 'Italian',
  'pt': 'Portuguese',
  'nl': 'Dutch',
  'ru': 'Russian',
  'zh': 'Chinese',
  'ja': 'Japanese',
  'ko': 'Korean'
};

// Fonction utilitaire pour normaliser le code de langue
function normalizeLanguageCode(lang: string): string {
  // Si c'est déjà un code de langue valide, le retourner
  if (LANGUAGE_CODES[lang.toLowerCase()]) {
    return LANGUAGE_CODES[lang.toLowerCase()];
  }
  // Si c'est un nom complet, le retourner tel quel
  const fullNames = Object.values(LANGUAGE_CODES);
  if (fullNames.includes(lang)) {
    return lang;
  }
  // Par défaut, retourner French
  return 'French';
}

const router = Router();
const upload = multer({ dest: 'uploads/' });

// Map pour stocker les sessions de traduction actives
const activeSessions = new Map<string, {
  translator: DocumentTranslator;
  progress: any;
}>();

const modelLoader = new ModelLoader();

const translateText = async (text: string, modelName: string, targetLanguage: string): Promise<string> => {
  debugLog('Starting translation:', { modelName, targetLanguage, textLength: text.length });
  
  try {
    const config = modelLoader.listModels().find((m: ModelConfig) => m.id === `ollama/${modelName}`);
    if (!config) {
      throw new Error(`Modèle non trouvé: ${modelName}`);
    }
    const engine = new TranslationEngine(config);
    const result = await engine.translateText(text, `ollama/${modelName}`, targetLanguage);
    debugLog('Translation completed successfully');
    return result;
  } catch (err) {
    const error = err as Error;
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
    const targetLanguage = normalizeLanguageCode(req.body.targetLanguage || 'fr');
    const useOCR = req.body.useOCR === 'true';
    const outputFormat = (req.body.outputFormat || 'txt') as 'txt' | 'pdf';
    const complexity = req.body.complexity || 'normal';
    
    if (!selectedModel) {
      const fileSize = fs.statSync(req.file.path).size;
      const recommendedModel = modelLoader.recommendModel(fileSize, complexity as 'simple' | 'normal' | 'complex');
      debugLog(`Modèle recommandé: ${recommendedModel.name} (${recommendedModel.id})`);
      return res.status(400).json({ 
        error: 'Aucun modèle sélectionné',
        recommendedModel: recommendedModel
      });
    }

    // Vérifier si le modèle est disponible localement
    const localModels = modelLoader.listModels();
    const modelConfig = localModels.find((m: ModelConfig) => m.id === `ollama/${selectedModel}`);
    
    if (!modelConfig) {
      return res.status(400).json({ 
        error: 'Modèle non disponible localement',
        availableModels: localModels
      });
    }

    debugLog('=== DÉBUT TRADUCTION ===');
    debugLog(`Fichier: ${req.file.originalname} (${path.extname(req.file.originalname)})`);
    debugLog(`Modèle: ${modelConfig.name} (${modelConfig.id})`);
    debugLog(`Taille du modèle: ${modelConfig.size}GB`);
    debugLog(`Contexte max: ${modelConfig.context} tokens`);
    debugLog(`Taille optimale des chunks: ${modelConfig.optimalChunkSize} tokens`);
    debugLog(`Langue cible: ${targetLanguage}`);
    debugLog(`OCR: ${useOCR}`);
    debugLog(`Format de sortie: ${outputFormat}`);

    let extractedSegments: OCRTextChunk[] = [];
    const formatter = new DocumentFormatter();
    const documentStyle = await formatter.analyzeOriginalStyle(req.file.path);

    const sessionId = Date.now().toString();
    const translator = new DocumentTranslator();
    
    // Initialiser la session avec un statut en cours
    activeSessions.set(sessionId, {
      translator,
      progress: {
        status: 'extracting',
        progress: 0,
        documentStyle,
        totalSegments: 0,
        currentSegment: 0,
        currentText: '',
        translatedText: ''
      }
    });

    // Envoyer la réponse immédiatement pour commencer le suivi de progression
    res.json({
      sessionId,
      message: 'Traduction démarrée'
    });

    try {
      debugLog(`Détection type de fichier: ${path.extname(req.file.originalname)}`);
      debugLog(`Mode OCR: ${useOCR ? 'activé' : 'désactivé'}`);

      const newPath = req.file.path + path.extname(req.file.originalname);
      await fs.promises.rename(req.file.path, newPath);
      req.file.path = newPath;
      
      const ocrProcessor = new OCRProcessor(`ollama/${selectedModel}`);
      extractedSegments = await ocrProcessor.extractText(req.file.path, useOCR);
      
      if (!extractedSegments || extractedSegments.length === 0) {
        throw new Error('Aucun texte extrait du document');
      }

      debugLog(`Extraction réussie: ${extractedSegments.length} segments extraits`);
      
      const extractedText = extractedSegments.map(segment => segment.text).join('\n\n');

      // Mettre à jour le statut après l'extraction réussie
      const session = activeSessions.get(sessionId);
      if (session) {
        session.progress = {
          ...session.progress,
          status: 'translating',
          totalSegments: extractedSegments.length,
          currentText: extractedText
        };
      }

      // Initialiser le traducteur avec la configuration
      const segmentationConfig: SegmentationConfig = {
        maxTokens: modelConfig.maxTokens,
        optimalChunkSize: modelConfig.optimalChunkSize,
        overlapPercentage: modelConfig.overlapPercentage,
        avgCharsPerToken: modelConfig.avgCharsPerToken,
        preserveMarkup: true,
        smartParagraphDetection: true,
        contextWindow: 2,
        minSegmentLength: 50
      };

      // Traduire le document
      const translatedSegments = await translator.translateDocument(
        extractedText,
        targetLanguage,
        `ollama/${selectedModel}`,
        segmentationConfig,
        (progress: TranslationProgress) => {
          const currentSession = activeSessions.get(sessionId);
          if (currentSession) {
            currentSession.progress = {
              ...currentSession.progress,
              progress: progress.progress,
              status: progress.status,
              currentPage: progress.currentPage,
              totalPages: progress.totalPages,
              translatedText: progress.translatedText,
              error: progress.error
            };
          }
        }
      );

      // Formater le document traduit
      const outputPath = path.join(__dirname, '../../translations', `${path.basename(req.file.originalname, path.extname(req.file.originalname))}_translated.${outputFormat}`);
      const formatter = new DocumentFormatter();
      await formatter.formatOutput(
        translatedSegments.map(segment => segment.translatedText).join('\n\n'),
        outputPath,
        outputFormat,
        documentStyle
      );

      // Mettre à jour le statut après la traduction réussie
      const finalSession = activeSessions.get(sessionId);
      if (finalSession) {
        finalSession.progress = {
          ...finalSession.progress,
          status: 'completed',
          progress: 100,
          translatedText: translatedSegments.map(segment => segment.translatedText).join('\n\n'),
          outputFile: `/translations/${path.basename(outputPath)}`
        };
      }
      debugLog('Traduction terminée avec succès');
    } catch (err) {
      const error = err as Error;
      debugLog('Erreur pendant la traduction:', error);
      const session = activeSessions.get(sessionId);
      if (session) {
        session.progress = {
          ...session.progress,
          status: 'error',
          error: error.message,
          progress: 0
        };
      }
    }
  } catch (err) {
    const error = err as Error;
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
  const session = activeSessions.get(sessionId);

  if (!session) {
    return res.status(404).json({ error: 'Session non trouvée' });
  }

  res.json(session.progress);
});

// Route pour nettoyer une session terminée
router.delete('/session/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  activeSessions.delete(sessionId);
  res.json({ message: 'Session supprimée' });
});

// Route pour obtenir la liste des modèles disponibles
router.get('/models', (req, res) => {
  try {
    const models = modelLoader.listModels();
    res.json(models);
  } catch (err) {
    const error = err as Error;
    res.status(500).json({
      error: 'Erreur lors de la récupération des modèles',
      details: error.message
    });
  }
});

export default router;
