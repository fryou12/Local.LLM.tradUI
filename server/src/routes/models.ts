import { Router } from 'express';
import { modelManager } from '../services/model-loader';
import type { Request, Response } from 'express';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  try {
    const models = modelManager.listModels();
    console.log('Modèles disponibles:', models);
    
    if (!models || models.length === 0) {
      return res.status(503).json({ 
        error: 'Aucun modèle Ollama détecté',
        solution: 'Exécutez "ollama pull llama3" puis redémarrez'
      });
    }
    
    // Renvoyer les modèles dans un tableau
    res.json(models);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
    res.status(500).json({ 
      error: 'Échec du chargement des modèles',
      details: process.env.NODE_ENV === 'development' ? errorMessage : null
    });
  }
});

export { router as modelsRouter };
