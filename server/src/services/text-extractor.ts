import { debugLog } from '../utils/logger';
import * as fs from 'fs';
import * as path from 'path';

let pdfParse: any;

// Import dynamique de pdf-parse
async function loadPdfParser() {
  if (!pdfParse) {
    try {
      pdfParse = (await import('pdf-parse')).default;
    } catch (error) {
      debugLog('Erreur lors du chargement de pdf-parse:', error);
      throw new Error('Module pdf-parse non disponible');
    }
  }
  return pdfParse;
}

interface ExtractionResult {
  text: string;
  pages: number;
  metadata: any;
}

export async function extractTextFromFile(filePath: string): Promise<ExtractionResult> {
  try {
    debugLog('Vérification du fichier:', filePath);
    
    // Vérifier si le fichier existe
    if (!fs.existsSync(filePath)) {
      throw new Error('Fichier non trouvé');
    }

    // Vérifier l'extension
    const ext = path.extname(filePath).toLowerCase();
    if (ext !== '.pdf') {
      throw new Error('Format de fichier non supporté. Seuls les fichiers PDF sont acceptés.');
    }

    debugLog('Lecture du fichier PDF');
    const dataBuffer = fs.readFileSync(filePath);
    
    if (!dataBuffer || dataBuffer.length === 0) {
      throw new Error('Fichier PDF vide ou corrompu');
    }

    debugLog('Chargement du parser PDF');
    const parser = await loadPdfParser();

    debugLog('Extraction du texte avec pdf-parse');
    const pdfData = await parser(dataBuffer, {
      max: 0, // pas de limite de pages
      version: 'v2.0.550'
    });

    if (!pdfData || !pdfData.text) {
      throw new Error('Échec de l\'extraction du texte');
    }

    debugLog('Extraction réussie');
    debugLog('Nombre de pages:', pdfData.numpages);
    debugLog('Taille du texte extrait:', pdfData.text.length);

    // Nettoyer le texte extrait
    const cleanedText = pdfData.text
      .replace(/[\r\n]+/g, '\n')      // Normaliser les sauts de ligne
      .replace(/\s+/g, ' ')           // Normaliser les espaces
      .trim();                        // Enlever les espaces au début et à la fin

    return {
      text: cleanedText,
      pages: pdfData.numpages,
      metadata: pdfData.metadata
    };
  } catch (error) {
    debugLog('Erreur lors de l\'extraction du texte:', error);
    throw new Error(
      error instanceof Error 
        ? `Échec de l'extraction du texte: ${error.message}`
        : 'Échec de l\'extraction du texte du fichier'
    );
  } finally {
    // Nettoyer le fichier temporaire si nécessaire
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        debugLog('Fichier temporaire supprimé:', filePath);
      }
    } catch (error) {
      debugLog('Erreur lors de la suppression du fichier temporaire:', error);
    }
  }
}
