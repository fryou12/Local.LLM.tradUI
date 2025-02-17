import { getDocument, PDFDocumentProxy } from 'pdfjs-dist';
import { readFile } from 'fs/promises';
import { Worker } from 'worker_threads';
import { debugLog } from '../utils/logger';
import { extname } from 'path';
import { getModelConfig, MODEL_CONFIGS } from '../services/models';

export interface OCRResult {
  text: string;
  pageNumber: number;
}

interface TextChunk {
  text: string;
  pageNumber: number;
  chunkNumber: number;
}

export class OCRProcessor {
  private readonly model: string;

  constructor(model: string) {
    this.model = model;
  }

  private async extractTextFromPDF(filePath: string, isOCRMode: boolean): Promise<OCRResult[]> {
    try {
      debugLog('=== Démarrage extraction PDF avec OCR ===');
      const pdfBuffer = await readFile(filePath);
      
      if (isOCRMode) {
        return this.performOCR(pdfBuffer);
      } else {
        return this.extractTextWithPDFJS(pdfBuffer);
      }
    } catch (error) {
      debugLog('Erreur lors de l\'extraction du texte:', error);
      throw new Error('Échec de l\'extraction du texte du PDF');
    }
  }

  private async performOCR(pdfBuffer: Buffer): Promise<OCRResult[]> {
    const base64PDF = pdfBuffer.toString('base64');

    // Utiliser un Worker Thread pour l'OCR
    const worker = new Worker(`
      const { parentPort } = require('worker_threads');
      const axios = require('axios');

      async function performOCR(base64PDF, model) {
        const prompt = \`You are an OCR system. Your task is to extract ONLY the main body text from this PDF document.
          IMPORTANT INSTRUCTIONS:
          - Extract ONLY the actual content text
          - DO NOT describe images, figures, or diagrams
          - DO NOT describe the document layout
          - DO NOT include headers, footers, or page numbers
          - DO NOT include cover information or metadata
          - DO NOT add any commentary or descriptions
          - Output the raw text content EXACTLY as it appears, preserving paragraphs
          - Maintain the exact same writing style and formatting
          - If you see mathematical formulas, extract them exactly as they appear

          <image>
          \${base64PDF}
          </image>

          Output the extracted text now:\`;

        const response = await axios.post('http://localhost:11434/api/generate', {
          model: model,
          prompt: prompt,
          stream: false
        });

        return response.data.response;
      }

      parentPort.on('message', async ({ pdf, model }) => {
        try {
          const result = await performOCR(pdf, model);
          parentPort.postMessage({ success: true, text: result });
        } catch (error) {
          parentPort.postMessage({ success: false, error: error.message });
        }
      });
    `);

    return new Promise((resolve, reject) => {
      worker.postMessage({ pdf: base64PDF, model: this.model });

      worker.on('message', (result) => {
        worker.terminate();
        if (result.success) {
          resolve([{ text: result.text, pageNumber: 1 }]);
        } else {
          reject(new Error(result.error));
        }
      });

      worker.on('error', (error) => {
        worker.terminate();
        reject(error);
      });
    });
  }

  private async extractTextWithPDFJS(pdfBuffer: Buffer): Promise<OCRResult[]> {
    // Convert Buffer to Uint8Array
    const uint8Array = new Uint8Array(pdfBuffer.buffer, pdfBuffer.byteOffset, pdfBuffer.byteLength);
    const loadingTask = getDocument({ data: uint8Array });
    const pdf = await loadingTask.promise;
    const results: OCRResult[] = [];

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const text = content.items
        .map((item: any) => item.str)
        .join(' ')
        .trim();

      if (text) {
        results.push({ text, pageNumber: i });
      }
    }

    return results;
  }

  async extractText(filePath: string, isOCRMode: boolean = false): Promise<TextChunk[]> {
    const fileExt = extname(filePath).toLowerCase();
    const defaultConfig = MODEL_CONFIGS['mistral:latest'];
    
    try {
      if (fileExt === '.txt') {
        debugLog('Détection fichier TXT - Lecture directe');
        const content = await readFile(filePath, 'utf8');
        debugLog('Lecture TXT réussie');
        return this.splitTextIntoChunks(content, defaultConfig.optimalChunkSize, defaultConfig.overlapPercentage);
      } else if (fileExt === '.pdf') {
        debugLog('Détection fichier PDF');
        if (isOCRMode) {
          debugLog('Mode OCR activé - Utilisation OCR');
          const results = await this.extractTextFromPDF(filePath, true);
          return this.processResults(results, defaultConfig);
        } else {
          debugLog('Mode OCR désactivé - Extraction texte directe');
          const results = await this.extractTextFromPDF(filePath, false);
          return this.processResults(results, defaultConfig);
        }
      } else {
        throw new Error(`Format de fichier non supporté: ${fileExt}`);
      }
    } catch (error) {
      debugLog('Erreur lors de l\'extraction:', error);
      throw error;
    }
  }

  private processResults(results: OCRResult[], config: any): TextChunk[] {
    return results.flatMap(result => 
      this.splitTextIntoChunks(
        result.text,
        config.optimalChunkSize,
        config.overlapPercentage
      ).map((chunk, index) => ({
        ...chunk,
        pageNumber: result.pageNumber
      }))
    );
  }

  private splitTextIntoChunks(text: string, chunkSize: number, overlapPercentage: number): TextChunk[] {
    const chunks: TextChunk[] = [];
    const words = text.split(/\s+/);
    const overlap = Math.floor(chunkSize * (overlapPercentage / 100));
    let currentChunk = '';
    let chunkNumber = 0;

    for (let i = 0; i < words.length; i++) {
      currentChunk += words[i] + ' ';
      
      if (currentChunk.length >= chunkSize || i === words.length - 1) {
        chunks.push({
          text: currentChunk.trim(),
          pageNumber: 1, // Sera mis à jour dans processResults
          chunkNumber: chunkNumber++
        });

        // Reculer pour l'overlap
        const overlapWords = words.slice(Math.max(0, i - overlap), i + 1);
        currentChunk = overlapWords.join(' ') + ' ';
      }
    }

    return chunks;
  }
}
