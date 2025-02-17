import axios from 'axios';
import CircuitBreaker from 'opossum';
import { debugLog } from '../utils/logger';
import { EventEmitter } from 'events';
import { getModelConfig, ModelConfig } from '../services/models';
import { TextSegmenter, TextSegment, SegmentationConfig } from './text-segmenter';

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
  private config: ModelConfig;

  constructor(config: ModelConfig) {
    this.config = config;
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
        return await this.ollamaRequest(model, prompt, timeout); // 2 minutes timeout for initial request
      } catch (error) {
        if (error.name === 'AbortError') {
          // Progressive shortening strategy
          const shortenedPrompt = this.shortenPrompt(prompt);
          const retryTimeout = Math.floor(this.getModelTimeout(model) * 0.6); // 60% du timeout initial
          return await this.ollamaRequest(model, shortenedPrompt, retryTimeout); // 1 minute for fallback
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
    // Progressive shortening: 70% -> 50% -> 30% of original length
    const currentLength = prompt.length;
    const newLength = Math.max(
      Math.floor(currentLength * 0.7),
      150  // Absolute minimum length
    );
    return prompt.substring(0, newLength);
  }

  private async ollamaRequest(model: string, prompt: string, timeout: number): Promise<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      debugLog('Starting translation request', {
        model,
        promptLength: prompt.length,
        timeout
      });

      const response = await fetch('http://localhost:11434/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          prompt,
          options: {
            temperature: 0.3,
            top_p: 0.6,
            num_predict: 512,
            num_ctx: 4096,
            num_gpu: -1
          }
        }),
        signal: controller.signal
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if (!response.body) throw new Error('Empty response body');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let result = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        try {
          const json = JSON.parse(chunk);
          if (json.response) {
            result += json.response;
          }
        } catch (error) {
          debugLog('Error parsing response chunk', { chunk, error });
          throw new Error('Invalid JSON response');
        }
      }

      return result;
    } catch (error) {
      debugLog('Translation request failed', error);
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private buildPrompt(text: string, targetLanguage: string): string {
    return `Translate the following text to ${targetLanguage}. Keep the original formatting, line breaks, and paragraph structure. Only output the translated text without any additional comments or explanations:

${text}`;
  }

  private async verifyModel(model: string): Promise<boolean> {
    try {
      const response = await fetch('http://localhost:11434/api/tags');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      
      const data = await response.json();
      if (!data.models || !Array.isArray(data.models)) {
        throw new Error('Invalid models response format');
      }
      
      return data.models.some((m: any) => m.name === model);
    } catch (error) {
      debugLog('Model verification failed', error);
      return false;
    }
  }

  async translateText(text: string, modelName: string, targetLanguage: string): Promise<string> {
    // Verify model availability
    const modelAvailable = await this.verifyModel(modelName);
    if (!modelAvailable) {
      throw new Error(`Model ${modelName} not found`);
    }

    const segmenter = new TextSegmenter(this.config, modelName);
    const segments = segmenter.segmentText(text);
    debugLog('Text segmented', { totalSegments: segments.length });

    const translations: string[] = [];
    
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      try {
        const prompt = this.buildPrompt(segment.text, targetLanguage);
        const timeout = this.getModelTimeout(modelName);
        const translation = await this.ollamaRequest(modelName, prompt, timeout);
        translations.push(translation);
      } catch (error) {
        debugLog('Segment translation failed', { segmentNumber: i, error });
        // Retry avec un timeout plus court
        try {
          const shortenedPrompt = this.shortenPrompt(segment.text);
          const retryTimeout = Math.floor(this.getModelTimeout(modelName) * 0.6); // 60% du timeout initial
          const translation = await this.ollamaRequest(modelName, this.buildPrompt(shortenedPrompt, targetLanguage), retryTimeout);
          translations.push(translation);
        } catch (retryError) {
          debugLog('Retry translation failed', { segmentNumber: i, error: retryError });
          translations.push(segment.text); // Keep original text on failure
        }
      }
    }

    return translations.join('\n');
  }

  async translate(text: string, targetLang: string, model: string): Promise<TranslationResult> {
    const prompt = `Translate the following text to ${targetLang}. Preserve all formatting and maintain the exact same style:

${text}

Translation:`;

    try {
      const translatedText = await this.translateWithRetry(model, prompt);
      if (typeof translatedText !== 'string') {
        throw new Error('La réponse du modèle n\'est pas une chaîne de caractères valide');
      }

      return {
        originalText: text,
        translatedText,
        model
      };
    } catch (error) {
      debugLog('Erreur de traduction:', error);
      throw error;
    }
  }

  async translateChunks(chunks: string[], targetLang: string, model: string): Promise<TranslationResult[]> {
    const results: TranslationResult[] = [];
    for (const chunk of chunks) {
      const result = await this.translate(chunk, targetLang, model);
      results.push(result);
    }
    return results;
  }

  private async translateWithRetry(model: string, prompt: string, retries = 3): Promise<string> {
    try {
      return await this.circuitBreaker.fire(model, prompt);
    } catch (error) {
      if (retries > 0) {
        await new Promise(resolve => setTimeout(resolve, 2000));  // Wait 2s between retries
        return this.translateWithRetry(model, prompt, retries - 1);
      }
      throw error;
    }
  }
}
