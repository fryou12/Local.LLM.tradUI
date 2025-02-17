import { useState, useEffect, useRef } from 'react';
import {
  DocumentArrowUpIcon,
  LanguageIcon,
  CpuChipIcon,
  ArrowPathIcon,
  DocumentMagnifyingGlassIcon
} from '@heroicons/react/24/outline';

interface Model {
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
  capabilities: string[];
}

interface ModelsResponse {
  models: Model[];
  count: number;
  timestamp: string;
}

interface TranslationMode {
  value: string;
  label: string;
}

interface TranslationProgress {
  status: 'idle' | 'preparing' | 'translating' | 'reassembling' | 'completed' | 'error';
  progress: number;
  currentSegment?: number;
  totalSegments?: number;
  currentPage?: number;
  totalPages?: number;
  estimatedTimeRemaining?: number;
  error?: string;
}

// Modes de traduction prédéfinis
const TRANSLATION_MODES: TranslationMode[] = [
  { value: 'text', label: 'Texte uniquement' },
  { value: 'ocr', label: 'OCR' }
];

export default function App() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [targetLanguage, setTargetLanguage] = useState('fr');
  const [selectedModel, setSelectedModel] = useState<string>('llama3:70b');
  const [translating, setTranslating] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [translationProgress, setTranslationProgress] = useState<TranslationProgress>({
    status: 'idle',
    progress: 0
  });
  const [translationMode, setTranslationMode] = useState<string>(TRANSLATION_MODES[0].value);
  const [availableModels, setAvailableModels] = useState<Model[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState<boolean>(true);
  const [modelError, setModelError] = useState<string | null>(null);
  const [translationError, setTranslationError] = useState<string | null>(null);

  const isOCRAvailable = selectedFile && selectedFile.name.toLowerCase().endsWith('.pdf');

  useEffect(() => {
    // Reset translation mode to 'text' if OCR is not available
    if (!isOCRAvailable && translationMode === 'ocr') {
      setTranslationMode('text');
    }
  }, [selectedFile]);

  // Fonction pour charger les modèles depuis l'API
  const fetchModels = async () => {
    try {
      setIsLoadingModels(true);
      setModelError(null);
      
      console.log('1. Envoi de la requête GET /api/models...');
      const response = await fetch('/api/models');
      console.log('2. Réponse reçue:', response.status);
      
      if (!response.ok) {
        throw new Error(`Erreur HTTP ${response.status}`);
      }

      const data = await response.json() as ModelsResponse;
      console.log('3. Données reçues:', JSON.stringify(data, null, 2));

      if (!data || typeof data !== 'object') {
        throw new Error('Réponse invalide: pas un objet');
      }

      if (!Array.isArray(data.models)) {
        throw new Error('Réponse invalide: models n\'est pas un tableau');
      }

      // Vérifie que chaque modèle a les propriétés requises
      const validModels = data.models.every((model: Model) => 
        model.name && 
        model.model && 
        model.modified_at && 
        typeof model.size === 'number' &&
        model.digest &&
        model.details &&
        Array.isArray(model.capabilities)
      );

      if (!validModels) {
        throw new Error('Réponse invalide: format de modèle incorrect');
      }

      setAvailableModels(data.models);
      setIsLoadingModels(false);
      
    } catch (error) {
      console.error('Erreur lors du chargement des modèles:', error);
      setModelError(error instanceof Error ? error.message : 'Erreur inconnue');
      setIsLoadingModels(false);
    }
  };

  useEffect(() => {
    fetchModels();
  }, []);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleTranslationModeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newMode = e.target.value;
    setTranslationMode(newMode);
  };

  const handleTranslate = async () => {
    if (!selectedFile) return;

    try {
      setTranslating(true);
      setTranslationProgress({ status: 'preparing', progress: 0 });
      
      // Ensure file has correct extension
      const formData = new FormData();
      const fileExtension = selectedFile.name.split('.').pop()?.toLowerCase() || '';
      if (!['txt', 'pdf'].includes(fileExtension)) {
        throw new Error(`Format de fichier non supporté: .${fileExtension}. Formats acceptés: .txt, .pdf`);
      }
      
      // Create a new file with original name to preserve extension
      const renamedFile = new File([selectedFile], selectedFile.name, {
        type: selectedFile.type
      });
      
      formData.append('file', renamedFile);
      formData.append('selectedModel', selectedModel);
      formData.append('targetLanguage', targetLanguage);
      formData.append('useOCR', (translationMode === 'ocr').toString());

      const response = await fetch('/api/translate', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
      }

      const data = await response.json();
      setSessionId(data.sessionId);

      // Démarrer la vérification de progression
      checkTranslationProgress(data.sessionId);

    } catch (error: any) {
      console.error('Translation failed:', error);
      setTranslationError(error instanceof Error ? error.message : 'Unknown error');
      setTranslationProgress({ status: 'error', progress: 0 });
      setSessionId(null);
    } finally {
      setTranslating(false);
    }
  };

  const checkTranslationProgress = async (sessionId: string) => {
    try {
      const response = await fetch(`/api/translate/progress/${sessionId}`);
      const data = await response.json();
      
      setTranslationProgress({
        ...translationProgress,
        ...data,
        progress: typeof data.progress === 'number' ? data.progress : 0
      });

      if (data.status === 'completed' && data.outputFile) {
        // Download the translated file using the correct path
        const downloadUrl = `http://localhost:3002${data.outputFile}`;
        window.location.href = downloadUrl;
        
        // Clear the translation session
        await fetch(`/api/translate/session/${sessionId}`, { method: 'DELETE' });
        setTranslationProgress({
          status: 'idle',
          progress: 0
        });
      } else if (data.status !== 'error') {
        // Continue polling if not completed or error
        setTimeout(() => checkTranslationProgress(sessionId), 1000);
      }
    } catch (error) {
      console.error('Error checking translation progress:', error);
      setTranslationProgress({
        ...translationProgress,
        status: 'error',
        error: 'Error checking translation progress'
      });
    }
  };

  useEffect(() => {
    // Cleanup function for the interval
    return () => {
      // Clean up session if it exists
      if (sessionId) {
        fetch(`/api/translate/session/${sessionId}`, {
          method: 'DELETE'
        }).catch(console.error);
        setSessionId(null);
      }
    };
  }, [sessionId]);

  const renderProgress = () => {
    if (translationProgress.status === 'idle') return null;

    const getStatusText = () => {
      switch (translationProgress.status) {
        case 'preparing':
          return 'Préparation du document...';
        case 'translating':
          return `Traduction en cours (${translationProgress.currentSegment}/${translationProgress.totalSegments})`;
        case 'reassembling':
          return 'Réassemblage du document...';
        case 'completed':
          return 'Traduction terminée !';
        case 'error':
          return 'Erreur lors de la traduction';
        default:
          return 'En cours...';
      }
    };

    const getTimeRemaining = () => {
      if (!translationProgress.estimatedTimeRemaining) return '';
      const minutes = Math.floor(translationProgress.estimatedTimeRemaining / 60000);
      const seconds = Math.floor((translationProgress.estimatedTimeRemaining % 60000) / 1000);
      return `Temps restant estimé : ${minutes}m ${seconds}s`;
    };

    return (
      <div className="progress-container">
        <div className="progress-status">
          <p>{getStatusText()}</p>
          {translationProgress.status === 'translating' && (
            <>
              <p>Page {translationProgress.currentPage}/{translationProgress.totalPages}</p>
              <p>{getTimeRemaining()}</p>
            </>
          )}
        </div>
        <div className="progress-bar">
          <div 
            className="progress-fill"
            style={{ width: `${translationProgress.progress}%` }}
          />
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="card">
        <div className="app-title">
          <h1>Book Translator Pro</h1>
          <p>Traduisez vos documents avec des models de langage locaux: Ollama</p>
        </div>

        <div className="section-group">
          <div className="input-section">
            {/* Section Fichier Source */}
            <div>
              <div className="label-container">
                <DocumentArrowUpIcon className="w-6 h-6 text-primary" />
                <span className="label-text">Fichier source</span>
              </div>
              <input
                type="file"
                accept=".pdf,.txt"
                onChange={handleFileChange}
                className="input-field text-center"
              />
            </div>

            {/* Section Mode de traduction */}
            <div>
              <div className="label-container">
                <DocumentMagnifyingGlassIcon className="w-6 h-6 text-primary" />
                <span className="label-text">Mode de traduction</span>
              </div>
              <select
                value={translationMode}
                onChange={handleTranslationModeChange}
                className="select-field text-center"
                disabled={!isOCRAvailable && translationMode === 'ocr'}
              >
                {TRANSLATION_MODES.map((mode) => (
                  <option key={mode.value} value={mode.value}>
                    {mode.label}
                  </option>
                ))}
              </select>
              {!isOCRAvailable && (
                <div className="text-yellow-500 text-sm mt-1">
                  Le mode OCR n'est disponible que pour les fichiers PDF.
                </div>
              )}
            </div>

            {/* Section Langue cible */}
            <div>
              <div className="label-container">
                <LanguageIcon className="w-6 h-6 text-primary" />
                <span className="label-text">Langue cible</span>
              </div>
              <select
                value={targetLanguage}
                onChange={(e) => setTargetLanguage(e.target.value)}
                className="select-field text-center"
              >
                <option value="fr">Français</option>
                <option value="en">Anglais</option>
                <option value="es">Espagnol</option>
                <option value="de">Allemand</option>
                <option value="it">Italien</option>
              </select>
            </div>

            {/* Section Modèle AI pour la traduction (toujours visible) */}
            <div>
              <div className="label-container">
                <CpuChipIcon className="w-6 h-6 text-primary" />
                <span className="label-text">Modèle de traduction</span>
              </div>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="select-field text-center"
                disabled={isLoadingModels}
              >
                {availableModels.map((model) => (
                  <option key={model.name} value={model.model}>
                    {model.name} ({model.details.parameter_size})
                  </option>
                ))}
              </select>
              {modelError && (
                <div className="error-message text-red-500 text-sm mt-1">
                  {modelError}
                </div>
              )}
              {!isLoadingModels && !modelError && availableModels.length === 0 && (
                <div className="text-yellow-500 text-sm mt-1">
                  Aucun modèle trouvé. Assurez-vous qu'Ollama est en cours d'exécution.
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="translation-section">
          <span className="translation-label">Lancer la traduction :</span>
          <button 
            className="btn-primary"
            onClick={handleTranslate}
            disabled={!selectedFile || translating}
          >
            {translating ? (
              <>
                <ArrowPathIcon className="w-5 h-5 animate-spin" />
                Traduction en cours...
              </>
            ) : (
              <>
                <LanguageIcon className="w-5 h-5" />
                Traduire
              </>
            )}
          </button>
        </div>

        {selectedFile && (
          <div className="file-status">
            Fichier sélectionné : {selectedFile.name}
          </div>
        )}

        {renderProgress()}
        {translationError && (
          <div className="error-message text-red-500 text-sm mt-1">
            {translationError}
          </div>
        )}
      </div>
    </div>
  );
}
