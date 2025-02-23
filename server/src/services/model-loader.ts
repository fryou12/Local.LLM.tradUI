import { execSync } from 'child_process';
import { ModelConfig } from '../config/models';

export class ModelLoader {
  private ollamaModels: ModelConfig[] = [];
  
  async initialize() {
    try {
      await this.loadModels();
      console.log(`🚀 ${this.ollamaModels.length} modèles Ollama chargés`);
      return this.ollamaModels;
    } catch (error) {
      console.error('💥 Échec critique:', this.formatError(error));
      throw error;
    }
  }

  public listModels(): ModelConfig[] {
    if (this.ollamaModels.length === 0) {
      this.loadModels(); // Recharger si vide
    }
    console.log('Modèles retournés:', this.ollamaModels);
    return this.ollamaModels;
  }

  private async loadModels() {
    try {
      const output = execSync('ollama list', { encoding: 'utf-8', timeout: 20000 });
      console.log('Sortie brute de ollama list:', output);
      
      this.ollamaModels = output
        .split('\n')
        .slice(1) // Ignorer l'en-tête
        .filter(line => line.trim())
        .map(line => {
          console.log('Traitement de la ligne:', line);
          const [name] = line.replace(/\s+/g, ' ').trim().split(' ');
          return {
            id: `ollama/${name}`,
            name: this.formatName(name),
            size: 0,
            capabilities: this.detectCapabilities(name),
            maxTokens: 8192,
            context: 8192,
            description: `Modèle ${name} via Ollama`,
            optimalChunkSize: 4096,
            overlapPercentage: 15,
            avgCharsPerToken: 4.0
          };
        });
      
      console.log('Modèles chargés:', this.ollamaModels);
    } catch (error) {
      console.error('Erreur lors du chargement des modèles:', this.formatError(error));
      throw new Error(`Échec du chargement des modèles: ${this.formatError(error)}`);
    }
  }

  private formatError(error: unknown): string {
    return error instanceof Error ? error.message : 'Erreur inconnue';
  }

  private formatName(fullName: string): string {
    return fullName.split(':')[0].replace(/[_-]/g, ' ');
  }

  private detectCapabilities(modelName: string): string[] {
    const capabilities = ['chat'];
    if (modelName.includes('mistral')) capabilities.push('analyse');
    if (modelName.includes('llava')) capabilities.push('vision');
    return capabilities;
  }

  public recommendModel(textLength: number, complexity: 'simple' | 'normal' | 'complex'): ModelConfig {
    const models = this.ollamaModels.sort((a, b) => b.maxTokens - a.maxTokens);
    return models[0] || this.ollamaModels[0];
  }
}

export const modelManager = new ModelLoader();