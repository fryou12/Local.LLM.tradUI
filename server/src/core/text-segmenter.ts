import { debugLog } from '../utils/logger';

// Extension de String pour compter les occurrences
declare global {
  interface String {
    count(substring: string): number;
  }
}

String.prototype.count = function(substring: string): number {
  return (this.match(new RegExp(substring, 'g')) || []).length;
};

export interface SegmentationConfig {
  maxTokens: number;
  optimalChunkSize: number;
  overlapPercentage: number;
  avgCharsPerToken: number;
  preserveMarkup: boolean;
  smartParagraphDetection: boolean;
  contextWindow: number;
  minSegmentLength?: number;
}

export interface TextSegment {
  id: string;
  text: string;
  metadata: {
    pageNumber: number;
    contextualInfo: {
      previousSegmentId?: string;
      nextSegmentId?: string;
    };
  };
}

export class TextSegmenter {
  // Configuration statique de base
  private static readonly DEFAULT_MIN_CHUNK_SIZE = 150;
  private static readonly DEFAULT_MAX_CHUNK_SIZE = 500;
  private static readonly CONTEXT_OVERLAP = 50;

  // Configurations spécifiques aux modèles
  private static MODEL_CONFIGS: {
    [key: string]: { maxSentences: number; maxChunkSize: number }
  } = {
    'llama3:70b': { maxSentences: 5, maxChunkSize: 2000 },
    'llava:34b': { maxSentences: 5, maxChunkSize: 2000 },
    'deepseek-r1:32b': { maxSentences: 5, maxChunkSize: 2000 },
    'llama3:8b': { maxSentences: 8, maxChunkSize: 1500 },
    'llava:13b': { maxSentences: 8, maxChunkSize: 1500 },
    'default': { maxSentences: 10, maxChunkSize: 1000 }
  };

  private config: SegmentationConfig;
  private modelName: string;

  constructor(config: SegmentationConfig, modelName: string) {
    this.config = config;
    this.modelName = modelName;
  }

  private getModelConfig(): { maxSentences: number; maxChunkSize: number } {
    return TextSegmenter.MODEL_CONFIGS[this.modelName] || TextSegmenter.MODEL_CONFIGS['default'];
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
        contextualInfo: {
          previousSegmentId: undefined,
          nextSegmentId: undefined,
        },
      },
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

  private sortSegments(segments: TextSegment[]): TextSegment[] {
    return segments.sort((a, b) => {
      if (a.metadata.pageNumber !== b.metadata.pageNumber) {
        return a.metadata.pageNumber - b.metadata.pageNumber;
      }
      
      const prevIdA = a.metadata.contextualInfo.previousSegmentId || '';
      const prevIdB = b.metadata.contextualInfo.previousSegmentId || '';
      return prevIdA.localeCompare(prevIdB);
    });
  }

  /**
   * Réassemble les segments traduits en préservant la structure
   */
  public reassembleText(segments: TextSegment[]): string {
    segments = this.sortSegments(segments);
    let currentPage = -1;
    let currentParagraph = '';
    const pages: string[] = [];

    segments.forEach(segment => {
      if (segment.metadata.pageNumber !== currentPage) {
        if (currentParagraph) {
          pages.push(currentParagraph);
          currentParagraph = '';
        }
        currentPage = segment.metadata.pageNumber;
      }

      currentParagraph += segment.text + ' ';
    });

    if (currentParagraph) {
      pages.push(currentParagraph);
    }

    return pages.join('\n\n');
  }
}
