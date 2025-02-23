import { debugLog } from '../utils/logger';
import fetch from 'node-fetch';

export interface ModelInfo {
  name: string;
  size: number;
  digest: string;
  modified_at: string;
  capabilities: string[];
}

export interface ModelConfig {
  maxTokens: number;
  optimalChunkSize: number;
  overlapPercentage: number;
  avgCharsPerToken: number;
}

export const MODEL_CONFIGS: { [key: string]: ModelConfig } = {
  'mistral:latest': {
    maxTokens: 4096,
    optimalChunkSize: 3500,
    overlapPercentage: 15,
    avgCharsPerToken: 4
  },
  'llama2:latest': {
    maxTokens: 2048,
    optimalChunkSize: 1800,
    overlapPercentage: 10,
    avgCharsPerToken: 4
  },
  'llama3:70b': {
    maxTokens: 4096,
    optimalChunkSize: 3000,
    overlapPercentage: 10,
    avgCharsPerToken: 4
  },
  'llama3:8b': {
    maxTokens: 2048,
    optimalChunkSize: 1800,
    overlapPercentage: 10,
    avgCharsPerToken: 4
  },
  'qwen2.5:14b': {
    maxTokens: 4096,
    optimalChunkSize: 3000,
    overlapPercentage: 10,
    avgCharsPerToken: 4
  }
};

// Vérifie si un modèle est disponible localement
export async function checkModelAvailability(modelName: string): Promise<boolean> {
  try {
    debugLog('Vérification de la disponibilité du modèle:', modelName);
    const response = await fetch('http://localhost:11434/api/tags');
    
    if (!response.ok) {
      debugLog('Erreur lors de la vérification des modèles:', response.status);
      return false;
    }

    const data = await response.json();
    const models = data.models || [];
    const isAvailable = models.some((model: any) => model.name === modelName);
    
    debugLog('Modèle disponible:', isAvailable);
    return isAvailable;
  } catch (error) {
    debugLog('Erreur lors de la vérification du modèle:', error);
    return false;
  }
}

// Récupère la liste complète des modèles avec leurs capacités
export async function getAvailableModels(): Promise<ModelInfo[]> {
  try {
    debugLog('Récupération de la liste des modèles');
    const response = await fetch('http://localhost:11434/api/tags');
    
    if (!response.ok) {
      throw new Error(`Erreur HTTP: ${response.status}`);
    }

    const data = await response.json();
    const models = data.models || [];

    return models.map((model: any) => ({
      name: model.name,
      size: model.size,
      digest: model.digest,
      modified_at: model.modified_at,
      capabilities: detectModelCapabilities(model.name)
    }));
  } catch (error) {
    debugLog('Erreur lors de la récupération des modèles:', error);
    throw error;
  }
}

// Détecte les capacités d'un modèle basé sur son nom
export function detectModelCapabilities(modelName: string): string[] {
  const capabilities = ['text'];
  
  if (modelName.toLowerCase().includes('llava')) {
    capabilities.push('vision');
  }
  
  if (modelName.toLowerCase().includes('mistral') || 
      modelName.toLowerCase().includes('llama') ||
      modelName.toLowerCase().includes('qwen')) {
    capabilities.push('translation');
  }

  return capabilities;
}

// Vérifie si Ollama est disponible
export async function checkOllamaAvailability(): Promise<boolean> {
  try {
    debugLog('Vérification de la disponibilité d\'Ollama');
    const response = await fetch('http://localhost:11434/api/tags');
    const isAvailable = response.ok;
    debugLog('Ollama disponible:', isAvailable);
    return isAvailable;
  } catch (error) {
    debugLog('Erreur lors de la vérification d\'Ollama:', error);
    return false;
  }
}

// Suggère le meilleur modèle pour une tâche donnée
export async function suggestModelForTask(task: 'translation' | 'ocr' | 'code_translation'): Promise<string | null> {
  try {
    const models = await getAvailableModels();
    
    // Filtrer les modèles par tâche
    const compatibleModels = models.filter(model => {
      switch (task) {
        case 'translation':
          return model.capabilities.includes('translation');
        case 'ocr':
          return model.capabilities.includes('vision');
        case 'code_translation':
          return model.capabilities.includes('translation');
        default:
          return false;
      }
    });

    if (compatibleModels.length === 0) {
      return null;
    }

    // Trier par préférence
    const preferredOrder = ['mistral:latest', 'llama3:70b', 'llama2:latest'];
    const sortedModels = compatibleModels.sort((a, b) => {
      const indexA = preferredOrder.indexOf(a.name);
      const indexB = preferredOrder.indexOf(b.name);
      if (indexA === -1 && indexB === -1) return 0;
      if (indexA === -1) return 1;
      if (indexB === -1) return -1;
      return indexA - indexB;
    });

    return sortedModels[0].name;
  } catch (error) {
    debugLog('Erreur lors de la suggestion de modèle:', error);
    return null;
  }
}

export async function getModelConfig(modelName: string): Promise<ModelConfig> {
  const config = MODEL_CONFIGS[modelName];
  if (!config) {
    throw new Error(`Configuration non trouvée pour le modèle ${modelName}`);
  }
  return config;
}
