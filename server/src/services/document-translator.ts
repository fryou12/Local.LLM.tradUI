import { EventEmitter } from 'events';
import { TranslationEngine } from '../core/translation-engine';
import { TextSegmenter, TextSegment } from '../core/text-segmenter';
import { ModelConfig, getModelConfig } from '../services/models';
import { TranslationProgress, TranslationResult } from '../types/translation';
import { SegmentationConfig } from '../types/segmentation';

export class DocumentTranslator {
  private translationEngine: TranslationEngine;
  private eventEmitter: EventEmitter;
  private translationStartTime: number = 0;
  private segmentsProcessed: number = 0;

  constructor() {
    const defaultConfig: ModelConfig = {
      maxTokens: 4096,
      optimalChunkSize: 3500,
      overlapPercentage: 15,
      avgCharsPerToken: 4
    };
    this.translationEngine = new TranslationEngine(defaultConfig);
    this.eventEmitter = new EventEmitter();
  }

  public async translateDocument(
    text: string,
    targetLanguage: string,
    modelName: string,
    segmentationConfig: SegmentationConfig,
    onProgress: (progress: TranslationProgress) => void
  ): Promise<TranslationResult[]> {
    this.translationStartTime = Date.now();
    this.segmentsProcessed = 0;

    try {
      const segmenter = new TextSegmenter(segmentationConfig, modelName);
      const pages = text.split('\f'); // Form feed character pour les pages
      let allSegments: TextSegment[] = [];

      this.emitProgress({
        progress: 0,
        currentPage: 0,
        totalPages: pages.length,
        status: 'preparing'
      }, onProgress);

      // Segmentation page par page
      pages.forEach((pageText, pageNumber) => {
        const segments = segmenter.segmentText(pageText, pageNumber);
        allSegments = allSegments.concat(segments);
      });

      // Traduction des segments
      const translatedSegments: TranslationResult[] = [];

      for (let i = 0; i < allSegments.length; i++) {
        const segment = allSegments[i];
        this.segmentsProcessed++;

        this.emitProgress({
          progress: (i / allSegments.length) * 100,
          currentPage: segment.metadata.pageNumber,
          totalPages: pages.length,
          status: 'translating'
        }, onProgress);

        const translatedText = await this.translationEngine.translateText(
          segment.text,
          modelName,
          targetLanguage
        );

        translatedSegments.push({
          originalText: segment.text,
          translatedText,
          model: modelName
        });

        this.emitProgress({
          progress: (i / allSegments.length) * 100,
          currentPage: segment.metadata.pageNumber,
          totalPages: pages.length,
          status: 'translating',
          translatedText: translatedSegments.map(s => s.translatedText).join('\n\n')
        }, onProgress);
      }

      this.emitProgress({
        progress: 100,
        currentPage: pages.length,
        totalPages: pages.length,
        status: 'completed'
      }, onProgress);

      return translatedSegments;
    } catch (error) {
      this.emitProgress({
        progress: 0,
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error'
      }, onProgress);
      throw error;
    }
  }

  private emitProgress(
    progress: TranslationProgress,
    callback: (progress: TranslationProgress) => void
  ): void {
    if (callback) {
      callback(progress);
    }
    this.eventEmitter.emit('progress', progress);
  }
}
