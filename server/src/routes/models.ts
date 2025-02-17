import express from 'express';
import axios from 'axios';

interface OllamaModel {
  name: string;
  model: string;
  modified_at: string;
  size: number;
  digest: string;
  details: {
    parent_model: string;
    format: string;
    family: string;
    families: string[];
    parameter_size: string;
    quantization_level: string;
  };
}

interface OllamaResponse {
  models: OllamaModel[];
}

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    console.log('1. Requête reçue sur /api/models');
    console.log('2. Tentative de connexion à Ollama sur http://localhost:11434/api/tags');
    
    const response = await axios.get('http://localhost:11434/api/tags');
    console.log('3. Réponse d\'Ollama reçue:', response.status);
    
    // Correction du JSON malformé
    let rawData = response.data;
    console.log('4. Type de données reçues:', typeof rawData);
    console.log('5. Données brutes:', JSON.stringify(rawData, null, 2));
    
    if (typeof rawData === 'string' && !rawData.trim().startsWith('{')) {
      rawData = '{' + rawData.trim();
    }
    
    // Parse le JSON
    let data: OllamaResponse;
    try {
      if (typeof rawData === 'string') {
        data = JSON.parse(rawData);
      } else {
        data = rawData;
      }
      console.log('6. Données parsées:', JSON.stringify(data, null, 2));
    } catch (parseError) {
      console.error('7. Erreur de parsing JSON:', parseError);
      return res.status(502).json({ 
        error: "Format de réponse Ollama invalide",
        details: parseError instanceof Error ? parseError.message : 'Erreur de parsing'
      });
    }

    if (!data || !Array.isArray(data.models)) {
      console.error('8. Format de réponse Ollama invalide:', data);
      return res.status(502).json({ error: "Format de réponse Ollama invalide" });
    }

    console.log('9. Transformation des modèles...');
    const transformedModels = data.models.map((model: OllamaModel) => ({
      name: model.name,
      model: model.model,
      modified_at: model.modified_at,
      size: model.size,
      digest: model.digest,
      details: model.details,
      capabilities: getModelCapabilities(model.name)
    }));

    const finalResponse = {
      models: transformedModels,
      count: transformedModels.length,
      timestamp: new Date().toISOString()
    };
    
    console.log('10. Envoi de la réponse au client:', JSON.stringify(finalResponse, null, 2));
    return res.json(finalResponse);
    
  } catch (error) {
    console.error('Erreur lors de la récupération des modèles:', error);
    if (axios.isAxiosError(error)) {
      console.error('Détails de l\'erreur Axios:', {
        message: error.message,
        code: error.code,
        response: error.response?.data
      });
    }
    return res.status(500).json({ 
      error: "Erreur lors de la récupération des modèles",
      details: error instanceof Error ? error.message : 'Erreur inconnue'
    });
  }
});

function getModelCapabilities(modelName: string): string[] {
  const capabilities = ['translation'];
  if (modelName.toLowerCase().includes('llava')) {
    capabilities.push('ocr');
  }
  return capabilities;
}

export default router;