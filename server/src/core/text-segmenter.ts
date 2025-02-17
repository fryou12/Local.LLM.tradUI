import { debugLog } from '../utils/logger';
import { ModelConfig } from '../services/models';

// Extension de String pour compter les occurrences
declare global {
  interface String {
    count(substring: string): number;
  }
}

String.prototype.count = function(substring: string): number {
  return (this.match(new RegExp(substring, 'g')) || []).length;
};

export interface TextSegment {
  id: string;
  text: string;
  metadata: {
    pageNumber: number;
    segmentNumber: number;
    contextualInfo: {
      previousSegmentId?: string;
      nextSegmentId?: string;
      isStartOfParagraph: boolean;
      isEndOfParagraph: boolean;
      specialMarkers: string[];
    };
  };
}

export interface SegmentationConfig extends ModelConfig {
  preserveMarkup: boolean;
  smartParagraphDetection: boolean;
  contextWindow: number;
  minSegmentLength: number;
  optimalChunkSize: number;
}

export class TextSegmenter {
  // Configuration statique de base
  private static readonly DEFAULT_MIN_CHUNK_SIZE = 150;
  private static readonly DEFAULT_MAX_CHUNK_SIZE = 500;
  private static readonly CONTEXT_OVERLAP = 50;

  // Configurations spécifiques aux modèles
  private static readonly MODEL_CONFIGS = {
    'llama3:70b': { maxSentences: 3, maxChunkSize: 300 },
    'llava:34b': { maxSentences: 3, maxChunkSize: 300 },
    'deepseek-r1:32b': { maxSentences: 3, maxChunkSize: 300 },
    'llama3:8b': { maxSentences: 5, maxChunkSize: 400 },
    'llava:13b': { maxSentences: 5, maxChunkSize: 400 }
  };

  private config: SegmentationConfig;
  private modelName: string;

  constructor(config: SegmentationConfig, modelName: string) {
    this.config = config;
    this.modelName = modelName;
  }

  private getModelConfig() {
    return TextSegmenter.MODEL_CONFIGS[this.modelName] || {
      maxSentences: 8,
      maxChunkSize: TextSegmenter.DEFAULT_MAX_CHUNK_SIZE
    };
  }

  public segmentText(text: string, pageNumber: number): TextSegment[] {
    const modelConfig = this.getModelConfig();
    const sentences = this.splitIntoSentences(text);
    const segments: TextSegment[] = [];
    let currentSegment: string[] = [];
    let currentLength = 0;
    let segmentNumber = 0;

    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i];
      const sentenceLength = sentence.length;

      // Vérifier si l'ajout de cette phrase dépasserait les limites
      const wouldExceedMaxSentences = currentSegment.length >= modelConfig.maxSentences;
      const wouldExceedMaxSize = currentLength + sentenceLength > modelConfig.maxChunkSize;

      if (wouldExceedMaxSentences || wouldExceedMaxSize) {
        // Sauvegarder le segment actuel
        if (currentSegment.length > 0) {
          segments.push(this.createSegment(currentSegment.join(' '), pageNumber, segmentNumber++));
          currentSegment = [];
          currentLength = 0;
        }
      }

      currentSegment.push(sentence);
      currentLength += sentenceLength;
    }

    // Ajouter le dernier segment s'il en reste
    if (currentSegment.length > 0) {
      segments.push(this.createSegment(currentSegment.join(' '), pageNumber, segmentNumber));
    }

    return segments;
  }

  private splitIntoSentences(text: string): string[] {
    // Regex améliorée pour la détection des phrases
    const sentenceRegex = /[^.!?]+[.!?]+/g;
    const sentences = text.match(sentenceRegex) || [text];
    return sentences.map(s => s.trim()).filter(s => s.length > 0);
  }

  private createSegment(
    text: string,
    pageNumber: number,
    segmentNumber: number
  ): TextSegment {
    return {
      id: `segment-${segmentNumber}`,
      text,
      metadata: {
        pageNumber,
        segmentNumber,
        contextualInfo: {
          isStartOfParagraph: segmentNumber === 0,
          isEndOfParagraph: false, // À améliorer si nécessaire
          specialMarkers: this.extractSpecialMarkers(text)
        }
      }
    };
  }

  /**
   * Extrait les marqueurs spéciaux (références, citations, etc.)
   */
  private extractSpecialMarkers(text: string): string[] {
    if (!this.config.preserveMarkup) {
      return [];
    }
    
    const markers = text.match(/(\[[^\]]+\]|\{[^\}]+\}|\([^\)]+\)|#[^\s]+)/g) || [];
    return markers.map(marker => marker.trim());
  }

  /**
   * Réassemble les segments traduits en préservant la structure
   */
  public reassembleText(segments: TextSegment[]): string {
    let currentPage = -1;
    let currentParagraph = '';
    const pages: string[] = [];

    segments.sort((a, b) => {
      if (a.metadata.pageNumber !== b.metadata.pageNumber) {
        return a.metadata.pageNumber - b.metadata.pageNumber;
      }
      return a.metadata.segmentNumber - b.metadata.segmentNumber;
    });

    segments.forEach(segment => {
      if (segment.metadata.pageNumber !== currentPage) {
        if (currentParagraph) {
          pages.push(currentParagraph);
          currentParagraph = '';
        }
        currentPage = segment.metadata.pageNumber;
      }

      if (segment.metadata.contextualInfo.isStartOfParagraph) {
        if (currentParagraph) {
          pages.push(currentParagraph);
        }
        currentParagraph = segment.text;
      } else {
        currentParagraph += ' ' + segment.text;
      }
    });

    if (currentParagraph) {
      pages.push(currentParagraph);
    }

    return pages.join('\n\n');
  }
}
