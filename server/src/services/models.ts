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
  'llava:latest': {
    maxTokens: 2048,
    optimalChunkSize: 1800,
    overlapPercentage: 10,
    avgCharsPerToken: 4
  }
};

// Vérifie si un modèle est disponible localement
export async function checkModelAvailability(modelName: string): Promise<boolean> {
  try {
    const response = await fetch('http://localhost:11434/api/tags');
    if (!response.ok) {
      throw new Error(`Erreur HTTP: ${response.status}`);
    }

    const data = await response.json();
    return data.models?.includes(modelName) || false;
  } catch (error) {
    debugLog('Erreur lors de la vérification du modèle:', error);
    return false;
  }
}

// Récupère la liste complète des modèles avec leurs capacités
export async function getAvailableModels(): Promise<ModelInfo[]> {
  try {
    const response = await fetch('http://localhost:11434/api/tags');
    if (!response.ok) {
      throw new Error(`Erreur HTTP: ${response.status}`);
    }

    const data = await response.json();
    return (data.models || []).map((model: ModelInfo) => ({
      ...model,
      capabilities: detectModelCapabilities(model.name)
    }));
  } catch (error) {
    debugLog('Erreur lors de la récupération des modèles:', error);
    return [];
  }
}

// Détecte les capacités d'un modèle basé sur son nom
function detectModelCapabilities(modelName: string): string[] {
  const capabilities: string[] = ['translation'];
  const name = modelName.toLowerCase();

  if (name.includes('llava')) {
    capabilities.push('ocr');
  }
  if (name.includes('mistral') || name.includes('llama')) {
    capabilities.push('advanced_translation');
  }
  if (name.includes('code')) {
    capabilities.push('code_translation');
  }

  return capabilities;
}

// Vérifie si Ollama est disponible
export async function checkOllamaAvailability(): Promise<boolean> {
  try {
    const response = await fetch('http://localhost:11434/api/tags');
    return response.ok;
  } catch {
    return false;
  }
}

// Suggère le meilleur modèle pour une tâche donnée
export function suggestModelForTask(
  models: ModelInfo[],
  task: 'translation' | 'ocr' | 'code_translation'
): string | null {
  // Filtrer les modèles par capacité
  const compatibleModels = models.filter(model => 
    model.capabilities.includes(task)
  );

  if (compatibleModels.length === 0) {
    return null;
  }

  // Prioriser les modèles
  switch (task) {
    case 'ocr':
      return compatibleModels.find(m => m.name.includes('llava'))?.name || compatibleModels[0].name;
    
    case 'translation':
      return (
        compatibleModels.find(m => m.name.includes('mistral'))?.name ||
        compatibleModels.find(m => m.name.includes('llama2'))?.name ||
        compatibleModels[0].name
      );
    
    case 'code_translation':
      return (
        compatibleModels.find(m => m.name.includes('code'))?.name ||
        compatibleModels.find(m => m.name.includes('starcoder'))?.name ||
        compatibleModels[0].name
      );
    
    default:
      return compatibleModels[0].name;
  }
}

export async function getModelConfig(modelName: string): Promise<ModelConfig> {
  return MODEL_CONFIGS[modelName] || {
    maxTokens: 2000,
    optimalChunkSize: 1800,
    overlapPercentage: 10,
    avgCharsPerToken: 4
  };
}
