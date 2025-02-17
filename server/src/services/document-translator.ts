import { TextSegmenter, TextSegment, SegmentationConfig } from '../core/text-segmenter';
import { TranslationEngine } from '../core/translation-engine';
import { debugLog } from '../utils/logger';
import { EventEmitter } from 'events';
import { getModelConfig } from './models';

export interface TranslationProgress {
  currentSegment: number;
  totalSegments: number;
  currentPage: number;
  totalPages: number;
  status: 'preparing' | 'translating' | 'reassembling' | 'completed';
  estimatedTimeRemaining?: number;
}

export class DocumentTranslator {
  private readonly translationEngine: TranslationEngine;
  private readonly eventEmitter: EventEmitter;
  private translationStartTime: number = 0;
  private segmentsProcessed: number = 0;

  constructor() {
    this.translationEngine = new TranslationEngine();
    this.eventEmitter = new EventEmitter();
  }

  /**
   * Traduit un document en utilisant une segmentation intelligente
   */
  public async translateDocument(
    text: string,
    targetLanguage: string,
    modelName: string,
    onProgress?: (progress: TranslationProgress) => void
  ): Promise<string> {
    this.translationStartTime = Date.now();
    this.segmentsProcessed = 0;

    // 1. Configuration de la segmentation
    const modelConfig = await getModelConfig(modelName);
    const segmentationConfig: SegmentationConfig = {
      ...modelConfig,
      preserveMarkup: true,
      smartParagraphDetection: true,
      contextWindow: 2,
      minSegmentLength: Math.floor(modelConfig.optimalChunkSize * 0.3)
    };

    // 2. Segmentation du texte
    const segmenter = new TextSegmenter(segmentationConfig);
    const pages = text.split('\f'); // Form feed character pour les pages
    let allSegments: TextSegment[] = [];

    this.emitProgress({
      currentSegment: 0,
      totalSegments: 0,
      currentPage: 0,
      totalPages: pages.length,
      status: 'preparing'
    }, onProgress);

    // 3. Segmentation page par page
    pages.forEach((pageText, pageNumber) => {
      const pageSegments = segmenter.segmentText(pageText, pageNumber + 1);
      allSegments = allSegments.concat(pageSegments);
    });

    // 4. Traduction des segments
    const translatedSegments: TextSegment[] = [];
    let currentContext = '';

    for (let i = 0; i < allSegments.length; i++) {
      const segment = allSegments[i];
      const previousSegment = translatedSegments[translatedSegments.length - 1];
      
      // Construire le contexte pour une meilleure cohérence
      if (previousSegment && previousSegment.metadata.contextualInfo.nextSegmentId === segment.id) {
        currentContext = previousSegment.text;
      }

      this.emitProgress({
        currentSegment: i + 1,
        totalSegments: allSegments.length,
        currentPage: segment.metadata.pageNumber,
        totalPages: pages.length,
        status: 'translating'
      }, onProgress);

      // Traduire avec contexte
      const translatedText = await this.translationEngine.translateText(
        segment.text,
        targetLanguage,
        modelName,
        this.getProgressCallback(i, allSegments.length)
      );

      translatedSegments.push({
        ...segment,
        text: translatedText
      });

      this.segmentsProcessed++;
    }

    // 5. Réassemblage du texte
    this.emitProgress({
      currentSegment: allSegments.length,
      totalSegments: allSegments.length,
      currentPage: pages.length,
      totalPages: pages.length,
      status: 'reassembling'
    }, onProgress);

    const finalText = segmenter.reassembleText(translatedSegments);

    this.emitProgress({
      currentSegment: allSegments.length,
      totalSegments: allSegments.length,
      currentPage: pages.length,
      totalPages: pages.length,
      status: 'completed'
    }, onProgress);

    return finalText;
  }

  private getProgressCallback(currentSegment: number, totalSegments: number) {
    return (progress: number) => {
      const elapsedTime = Date.now() - this.translationStartTime;
      const averageTimePerSegment = elapsedTime / this.segmentsProcessed;
      const remainingSegments = totalSegments - currentSegment;
      const estimatedTimeRemaining = averageTimePerSegment * remainingSegments;

      this.eventEmitter.emit('segmentProgress', {
        segmentProgress: progress,
        estimatedTimeRemaining
      });
    };
  }

  private emitProgress(
    progress: TranslationProgress,
    callback?: (progress: TranslationProgress) => void
  ) {
    if (callback) {
      callback(progress);
    }
    this.eventEmitter.emit('progress', progress);
  }

  public on(event: string, listener: (...args: any[]) => void) {
    this.eventEmitter.on(event, listener);
  }

  public off(event: string, listener: (...args: any[]) => void) {
    this.eventEmitter.off(event, listener);
  }
}
