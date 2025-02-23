import { Router } from 'express';
import { debugLog } from '../utils/logger';
import { getAvailableModels, MODEL_CONFIGS } from '../services/models';

const router = Router();

router.get('/', async (_req, res) => {
  try {
    debugLog('Récupération de la liste des modèles');
    const response = await fetch('http://localhost:11434/api/tags');
    
    if (!response.ok) {
      debugLog('Erreur lors de la récupération des modèles depuis Ollama:', response.status);
      return res.status(503).json({
        success: false,
        error: 'Le service Ollama n\'est pas disponible. Veuillez vérifier qu\'il est démarré.'
      });
    }

    const data = await response.json();
    const models = data.models || [];
    
    // Transformer les modèles pour le frontend
    const formattedModels = models
      .filter(model => MODEL_CONFIGS[model.name]) // Ne garder que les modèles configurés
      .map(model => {
        const config = MODEL_CONFIGS[model.name];
        if (!config) return null;
        
        return {
          id: model.name,
          name: model.name,
          size: model.size,
          maxTokens: config.maxTokens,
          optimalChunkSize: config.optimalChunkSize,
          overlapPercentage: config.overlapPercentage,
          avgCharsPerToken: config.avgCharsPerToken,
          description: `${model.name} (${Math.round(model.size / 1024 / 1024 / 1024)}GB)`,
          capabilities: ['translation']
        };
      })
      .filter(Boolean); // Enlever les null

    if (formattedModels.length === 0) {
      debugLog('Aucun modèle compatible trouvé');
      return res.status(404).json({
        success: false,
        error: 'Aucun modèle compatible n\'a été trouvé. Veuillez installer au moins un des modèles suivants : mistral:latest, llama2:latest, llama3:70b, llama3:8b, qwen2.5:14b'
      });
    }

    debugLog('Modèles disponibles:', formattedModels);
    res.json(formattedModels);
  } catch (error) {
    debugLog('Erreur lors de la récupération des modèles:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Erreur lors de la récupération des modèles'
    });
  }
});

export default router;
