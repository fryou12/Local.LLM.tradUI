export interface TranslationProgress {
  progress: number;
  currentPage?: number;
  totalPages?: number;
  status: 'preparing' | 'translating' | 'reassembling' | 'completed' | 'error';
  estimatedTimeRemaining?: number;
  translatedText?: string;
  error?: string;
}

export interface TranslationResult {
  originalText: string;
  translatedText: string;
  model: string;
}
