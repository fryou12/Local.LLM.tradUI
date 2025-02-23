import axios from 'axios';
import CircuitBreaker from 'opossum';
import { debugLog } from '../utils/logger';
import { EventEmitter } from 'events';
import { getModelConfig, ModelConfig } from '../services/models';
import { TextSegmenter, TextSegment, SegmentationConfig } from './text-segmenter';

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
  private config: ModelConfig;
  private readonly RETRY_DELAY = 1000;
  private readonly MAX_RETRIES = 3;

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
        if (error instanceof Error && error.name === 'AbortError') {
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
    // Utiliser le code de langue directement
    return `You are a professional translator. Translate the following text to ${targetLanguage}. Maintain the original formatting, style, and tone. Here's the text to translate:\n\n${text}`;
  }

  private async verifyModel(modelName: string): Promise<boolean> {
    try {
      const response = await fetch('http://localhost:11434/api/tags');
      const data = await response.json() as { models: Array<{ name: string }> };
      
      if (!data.models || !Array.isArray(data.models)) {
        return false;
      }
      
      return data.models.some((m) => m.name === modelName);
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        return false;
      }
      debugLog('Error verifying model:', error);
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  public async translateText(text: string, modelName: string, targetLanguage: string): Promise<string> {
    try {
      const modelAvailable = await this.verifyModel(modelName);
      if (!modelAvailable) {
        throw new Error(`Model ${modelName} not found`);
      }

      const prompt = this.buildPrompt(text, targetLanguage);
      return await this.translateWithRetry(modelName, prompt);
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Translation request was aborted');
      }
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  async translate(text: string, targetLang: string, model: string): Promise<TranslationResult> {
    const normalizedLanguage = this.normalizeLanguageCode(targetLang);
    
    const prompt = `You are a professional translator. Translate the following text to ${normalizedLanguage}. Maintain the original formatting, style, and tone. Here's the text to translate:\n\n${text}`;
    
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

  private async handleError(error: unknown): Promise<never> {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Translation request was aborted');
    }
    throw error instanceof Error ? error : new Error(String(error));
  }

  private async translateWithRetry(model: string, prompt: string, retries = 3): Promise<string> {
    let lastError: Error | null = null;
    
    for (let i = 0; i < retries; i++) {
      try {
        const result = await this.circuitBreaker.fire(model, prompt) as string;
        return result;
      } catch (error: unknown) {
        if (error instanceof Error && error.name === 'AbortError') {
          debugLog('Request aborted by user');
          break;
        }
        
        lastError = error instanceof Error ? error : new Error(String(error));
        debugLog(`Attempt ${i + 1}/${retries} failed:`, lastError.message);
        
        if (i < retries - 1) {
          await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY));
        }
      }
    }
    
    throw lastError || new Error('Translation failed after all retries');
  }

  private LANGUAGE_CODES: { [key: string]: string } = {
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

  private normalizeLanguageCode(lang: string): string {
    // Si c'est déjà un code de langue court, le retourner tel quel
    if (Object.keys(this.LANGUAGE_CODES).includes(lang.toLowerCase())) {
      return lang.toLowerCase();
    }
    
    // Si c'est un nom de langue complet, trouver le code correspondant
    const code = Object.entries(this.LANGUAGE_CODES).find(
      ([_, name]) => name.toLowerCase() === lang.toLowerCase()
    )?.[0];
    
    if (code) {
      return code;
    }
    
    // Par défaut, retourner la langue telle quelle
    return lang.toLowerCase();
  }
}
