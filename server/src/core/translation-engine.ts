import axios from 'axios';
import CircuitBreaker from 'opossum';
import { debugLog } from '../utils/logger';
import { EventEmitter } from 'events';
import { TextSegmenter, TextSegment, SegmentationConfig } from './text-segmenter';
import fetch from 'node-fetch';

interface AbortError {
  name: 'AbortError';
  message: string;
}

export interface TranslationResult {
  originalText: string;
  translatedText: string;
  model: string;
}

interface ChunkResult {
  text: string;
  isComplete: boolean;
}

interface TranslationProgress {
  progress: number;
  status: 'extracting' | 'translating' | 'saving' | 'completed' | 'error';
  currentChunk?: number;
  totalChunks?: number;
  message?: string;
  estimatedTimeRemaining?: number;
}

export class TranslationEngine {
  private readonly circuitBreaker: CircuitBreaker;
  private readonly eventEmitter: EventEmitter;
  private readonly RETRY_DELAY = 1000;
  private readonly MAX_RETRIES = 3;

  constructor() {
    this.eventEmitter = new EventEmitter();
    this.circuitBreaker = this.initializeCircuitBreaker();

    // Événements du Circuit Breaker
    this.circuitBreaker.on('success', () => debugLog('Traduction réussie'));
    this.circuitBreaker.on('timeout', () => debugLog('Timeout de la traduction'));
    this.circuitBreaker.on('reject', () => debugLog('Circuit ouvert - requête rejetée'));
    this.circuitBreaker.on('open', () => debugLog('Circuit ouvert - trop d\'erreurs'));
    this.circuitBreaker.on('halfOpen', () => debugLog('Circuit semi-ouvert - test de reconnexion'));
    this.circuitBreaker.on('close', () => debugLog('Circuit fermé - fonctionnement normal'));
  }

  private getModelTimeout(model: string): number {
    // Timeouts adaptés selon la taille du modèle
    const largeModels = ['llama3:70b', 'llava:34b', 'deepseek-r1:32b'];
    const mediumModels = ['llama3:8b', 'llava:13b'];
    
    if (largeModels.includes(model)) {
      return 300000; // 5 minutes pour les grands modèles
    } else if (mediumModels.includes(model)) {
      return 180000; // 3 minutes pour les modèles moyens
    }
    return 120000; // 2 minutes pour les petits modèles
  }

  private initializeCircuitBreaker() {
    const breaker = new CircuitBreaker(async (model: string, prompt: string) => {
      try {
        const timeout = this.getModelTimeout(model);
        return await this.ollamaRequest(model, prompt, timeout);
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          // Progressive shortening strategy
          const shortenedPrompt = this.shortenPrompt(prompt);
          const retryTimeout = Math.floor(this.getModelTimeout(model) * 0.6);
          return await this.ollamaRequest(model, shortenedPrompt, retryTimeout);
        }
        throw error;
      }
    }, {
      timeout: 360000,        // 6 minutes overall timeout
      errorThresholdPercentage: 40,
      resetTimeout: 45000,    // 45 seconds cooldown
      volumeThreshold: 3
    });

    breaker.fallback(async (model: string, prompt: string) => {
      debugLog('Final fallback triggered, returning original text');
      return prompt;
    });

    return breaker;
  }

  private shortenPrompt(prompt: string): string {
    const maxLength = 8000;
    if (prompt.length <= maxLength) return prompt;
    
    // Couper le texte en gardant le début et la fin
    const halfLength = Math.floor(maxLength / 2);
    return prompt.slice(0, halfLength) + ' ... ' + prompt.slice(-halfLength);
  }

  private async ollamaRequest(model: string, prompt: string, timeout: number): Promise<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch('http://localhost:11434/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: model,
          prompt: prompt,
          stream: false
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`Erreur HTTP: ${response.status}`);
      }

      const data = await response.json();
      return data.response;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  public async translateText(
    text: string,
    model: string,
    targetLanguage: string,
    onProgress?: (chunk: string) => void
  ): Promise<string> {
    debugLog('Début de la traduction avec le modèle:', model);
    debugLog('Langue cible:', targetLanguage);
    debugLog('Longueur du texte:', text.length);

    // Segmenter le texte en morceaux gérables
    const segmentConfig: SegmentationConfig = {
      maxLength: 1000,
      overlap: 50
    };

    const segmenter = new TextSegmenter(segmentConfig);
    const segments = segmenter.segment(text);
    debugLog('Nombre de segments:', segments.length);

    let translatedText = '';
    let currentSegment = 1;

    for (const segment of segments) {
      debugLog(`Traduction du segment ${currentSegment}/${segments.length}`);
      
      const prompt = this.buildTranslationPrompt(segment.text, targetLanguage);
      
      try {
        const translatedSegment = await this.circuitBreaker.fire(model, prompt);
        translatedText += translatedSegment + ' ';
        
        if (onProgress) {
          onProgress(translatedSegment + ' ');
        }
      } catch (error) {
        debugLog('Erreur lors de la traduction du segment:', error);
        throw new Error('Erreur lors de la traduction');
      }

      currentSegment++;
    }

    debugLog('Traduction terminée');
    return translatedText.trim();
  }

  private buildTranslationPrompt(text: string, targetLanguage: string): string {
    return `Translate the following text to ${targetLanguage}. Preserve the formatting and maintain a professional tone:

${text}

Translation:`;
  }
}
