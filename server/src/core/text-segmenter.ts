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
  maxLength: number;
  overlap: number;
}

export interface TextSegment {
  text: string;
  index: number;
}

export class TextSegmenter {
  private config: SegmentationConfig;

  constructor(config: SegmentationConfig) {
    this.config = {
      maxLength: config.maxLength || 1000,
      overlap: config.overlap || 50
    };
  }

  public segment(text: string): TextSegment[] {
    debugLog('Début de la segmentation');
    debugLog('Configuration:', this.config);
    
    const segments: TextSegment[] = [];
    let currentPosition = 0;
    let segmentIndex = 0;

    while (currentPosition < text.length) {
      // Calculer la fin du segment
      let endPosition = currentPosition + this.config.maxLength;
      
      // Si ce n'est pas la fin du texte, chercher une fin de phrase
      if (endPosition < text.length) {
        // Chercher le dernier point ou retour à la ligne dans la plage
        const lastSentenceEnd = this.findLastSentenceEnd(
          text.slice(currentPosition, endPosition + this.config.overlap)
        );
        
        if (lastSentenceEnd > 0) {
          endPosition = currentPosition + lastSentenceEnd;
        }
      } else {
        endPosition = text.length;
      }

      // Créer le segment
      segments.push({
        text: text.slice(currentPosition, endPosition).trim(),
        index: segmentIndex++
      });

      debugLog(`Segment ${segmentIndex} créé, longueur: ${endPosition - currentPosition}`);

      // Avancer la position en tenant compte du chevauchement
      currentPosition = endPosition;
    }

    debugLog(`Segmentation terminée, ${segments.length} segments créés`);
    return segments;
  }

  private findLastSentenceEnd(text: string): number {
    // Chercher le dernier point suivi d'un espace ou d'un retour à la ligne
    const matches = [...text.matchAll(/[.!?]\s+/g)];
    if (matches.length > 0) {
      const lastMatch = matches[matches.length - 1];
      return lastMatch.index! + 1;
    }
    return -1;
  }
}
