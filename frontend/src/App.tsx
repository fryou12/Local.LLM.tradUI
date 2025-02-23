import { useState, useEffect } from 'react';
import {
  DocumentArrowUpIcon,
  LanguageIcon,
  CpuChipIcon
} from '@heroicons/react/24/outline';
import './App.css';

interface Model {
  id: string;
  name: string;
  size: number;
  maxTokens: number;
  context: number;
  optimalChunkSize: number;
  overlapPercentage: number;
  avgCharsPerToken: number;
  description: string;
  capabilities: string[];
}

interface TranslationMode {
  value: string;
  label: string;
}

const TRANSLATION_MODES: TranslationMode[] = [
  { value: 'text', label: 'Texte uniquement' },
  { value: 'ocr', label: 'OCR' }
];

const TARGET_LANGUAGES = [
  { value: 'fr', label: 'Français' },
  { value: 'en', label: 'Anglais' },
  { value: 'es', label: 'Espagnol' },
  { value: 'it', label: 'Italien' },
  { value: 'de', label: 'Allemand' }
];

const OUTPUT_FORMATS = [
  { value: 'txt', label: 'Texte (.txt)' },
  { value: 'pdf', label: 'PDF (.pdf)' }
];

export default function App() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [sourceText, setSourceText] = useState('');
  const [targetLanguage, setTargetLanguage] = useState('fr');
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [translating, setTranslating] = useState(false);
  const [translationMode, setTranslationMode] = useState<string>(TRANSLATION_MODES[0].value);
  const [availableModels, setAvailableModels] = useState<Model[]>([]);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [translationError, setTranslationError] = useState<string | null>(null);
  const [outputFormat, setOutputFormat] = useState<'txt' | 'pdf'>('txt');
  const [translationStream, setTranslationStream] = useState('');

  const isOCRAvailable = selectedFile && selectedFile.name.toLowerCase().endsWith('.pdf');

  useEffect(() => {
    if (!isOCRAvailable && translationMode === 'ocr') {
      setTranslationMode('text');
    }
  }, [selectedFile, isOCRAvailable, translationMode]);

  const fetchModels = async () => {
    try {
      const response = await fetch('/api/models');
      if (!response.ok) {
        throw new Error(`Erreur HTTP ${response.status}`);
      }

      const data = await response.json();
      if (!Array.isArray(data)) {
        throw new Error('Format de réponse invalide');
      }

      setAvailableModels(data);
      if (data.length > 0) {
        setSelectedModel(data[0].id);
      }
    } catch (error) {
      console.error('Erreur lors du chargement des modèles:', error);
      setModelsError('Impossible de charger les modèles. Veuillez réessayer plus tard.');
    }
  };

  useEffect(() => {
    fetchModels();
  }, []);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setSourceText('');
    setTranslationStream('');
    setTranslating(false);
    setTranslationError(null);

    if (file.type === 'application/pdf') {
      try {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch('/api/extract-text', {
          method: 'POST',
          body: formData
        });

        const result = await response.json();
        
        if (!response.ok) {
          throw new Error(result.error || `Erreur HTTP ${response.status}`);
        }

        if (!result.success) {
          throw new Error(result.error || 'Erreur lors de l\'extraction du texte');
        }

        setSourceText(result.text);
        console.log('Informations PDF:', result.info);
      } catch (error) {
        console.error('Erreur lors de la lecture du fichier:', error);
        setTranslationError(
          error instanceof Error ? error.message : 'Erreur lors de la lecture du fichier'
        );
        setSourceText('');
      }
    } else {
      try {
        const text = await file.text();
        setSourceText(text);
      } catch (error) {
        console.error('Erreur lors de la lecture du fichier:', error);
        setTranslationError(
          error instanceof Error ? error.message : 'Erreur lors de la lecture du fichier'
        );
        setSourceText('');
      }
    }
  };

  const handleTranslate = async () => {
    if (!sourceText && !selectedFile) {
      setTranslationError('Veuillez fournir un texte ou un fichier à traduire');
      return;
    }

    if (!selectedModel) {
      setTranslationError('Veuillez sélectionner un modèle de traduction');
      return;
    }

    if (!targetLanguage) {
      setTranslationError('Veuillez sélectionner une langue cible');
      return;
    }

    setTranslating(true);
    setTranslationStream('');
    setTranslationError(null);

    try {
      const formData = new FormData();
      if (selectedFile) {
        formData.append('file', selectedFile);
      } else if (sourceText) {
        formData.append('text', sourceText);
      }
      
      formData.append('targetLanguage', targetLanguage);
      formData.append('model', selectedModel); // Assurez-vous que selectedModel est défini

      console.log('Envoi de la requête avec:', {
        file: selectedFile?.name,
        targetLanguage,
        model: selectedModel
      });

      const response = await fetch('/api/translate', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Erreur HTTP ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Impossible de lire la réponse');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              
              switch (data.status) {
                case 'start':
                  console.log('Début de la traduction:', data.message);
                  break;
                case 'success':
                  setTranslationStream(prev => prev + data.text);
                  break;
                case 'error':
                  throw new Error(data.error);
                case 'end':
                  console.log('Traduction terminée');
                  break;
              }
            } catch (e) {
              console.warn('Erreur lors du parsing de la progression:', e);
            }
          }
        }
      }
    } catch (error) {
      console.error('Erreur de traduction:', error);
      setTranslationError(
        error instanceof Error ? error.message : 'Erreur lors de la traduction'
      );
    } finally {
      setTranslating(false);
    }
  };

  const getModelSize = (model: Model): number => {
    // Pour les modèles MOE
    if (model.id.includes('MOE')) {
      const moeMatch = model.id.match(/(\d+\.?\d*)B/);
      return moeMatch ? parseFloat(moeMatch[1]) : 0;
    }

    // Pour les modèles standards
    const paramMatch = model.id.match(/[:/](\d+\.?\d*)b/i);
    if (paramMatch) {
      return parseFloat(paramMatch[1]);
    }

    // Pour les modèles avec tag "latest"
    const defaultSizes: { [key: string]: number } = {
      'llama2': 7,
      'llava': 7,
      'mistral': 7,
    };
    const modelBase = model.name.toLowerCase();
    return defaultSizes[modelBase] || 0;
  };

  const getModelFamily = (model: Model): string => {
    const name = model.name.toLowerCase();
    if (name.includes('llama3')) return 'llama3';
    if (name.includes('llama2')) return 'llama2';
    if (name.includes('llava')) return 'llava';
    if (name.includes('mistral')) return 'mistral';
    if (name.includes('qwen')) return 'qwen';
    if (name.includes('deepseek')) return 'deepseek';
    if (name.includes('moe')) return 'moe';
    return 'other';
  };

  const sortModels = (models: Model[]): Model[] => {
    return [...models].sort((a, b) => {
      // D'abord trier par famille
      const familyA = getModelFamily(a);
      const familyB = getModelFamily(b);
      if (familyA !== familyB) return familyA.localeCompare(familyB);
      
      // Puis par taille
      return getModelSize(b) - getModelSize(a);
    });
  };

  const getModelDisplayName = (model: Model): string => {
    // Extraire le nombre de paramètres du nom ou de l'ID
    const paramMatch = model.id.match(/[:/](\d+\.?\d*)b/i);
    const params = paramMatch ? paramMatch[1] : '';
    
    // Pour les modèles spéciaux comme MOE
    if (model.id.includes('MOE')) {
      const moeMatch = model.id.match(/(\d+\.?\d*)B/);
      return `${model.name} (${moeMatch ? moeMatch[1] : ''}B params)`;
    }

    // Pour les modèles avec tag "latest"
    if (model.id.includes(':latest')) {
      const defaultSizes: { [key: string]: string } = {
        'llama2': '7',
        'llava': '7',
        'mistral': '7',
      };
      const modelBase = model.name.toLowerCase();
      const defaultSize = defaultSizes[modelBase];
      return defaultSize ? `${model.name} (${defaultSize}B params)` : model.name;
    }
    
    // Pour les modèles standards
    return params ? `${model.name} (${params}B params)` : model.name;
  };

  return (
    <div>
      <h1 className="app-title">L.L.M.Trad</h1>
      
      <div className="app-container">
        <div className="config-panel">
          <h2 className="panel-title">Configuration</h2>
          
          <div className="control-group">
            <label className="control-label">
              <DocumentArrowUpIcon className="icon" />
              Fichier source
            </label>
            <input
              type="file"
              onChange={handleFileSelect}
              accept=".txt,.pdf"
              style={{ display: 'none' }}
              id="file-input"
            />
            <button
              onClick={() => document.getElementById('file-input')?.click()}
              className="control-button"
              disabled={translating}
            >
              Sélectionner
            </button>
            {selectedFile && (
              <span className="selected-file">
                {selectedFile.name}
              </span>
            )}
          </div>

          <div className="control-group">
            <label className="control-label">
              <CpuChipIcon className="icon" />
              Mode de traduction
            </label>
            <select
              value={translationMode}
              onChange={(e) => setTranslationMode(e.target.value)}
              className="control-select"
              disabled={translating}
            >
              {TRANSLATION_MODES.map(mode => (
                <option 
                  key={mode.value} 
                  value={mode.value}
                  disabled={mode.value === 'ocr' && !isOCRAvailable}
                >
                  {mode.label}
                </option>
              ))}
            </select>
          </div>

          <div className="control-group">
            <label className="control-label">
              <LanguageIcon className="icon" />
              Langue cible
            </label>
            <select
              value={targetLanguage}
              onChange={(e) => setTargetLanguage(e.target.value)}
              className="control-select"
              disabled={translating}
            >
              {TARGET_LANGUAGES.map(lang => (
                <option key={lang.value} value={lang.value}>
                  {lang.label}
                </option>
              ))}
            </select>
          </div>

          <div className="control-group">
            <label className="control-label">
              <CpuChipIcon className="icon" />
              Sélection du modèle
            </label>
            <select
              className="control-select"
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              disabled={!availableModels.length}
            >
              {sortModels(availableModels).map((model) => (
                <option key={model.id} value={model.id}>
                  {getModelDisplayName(model)}
                </option>
              ))}
            </select>
          </div>

          <div className="control-group">
            <label className="control-label">
              Format de sortie
            </label>
            <select
              value={outputFormat}
              onChange={(e) => setOutputFormat(e.target.value as 'txt' | 'pdf')}
              className="control-select"
              disabled={translating}
            >
              {OUTPUT_FORMATS.map(format => (
                <option key={format.value} value={format.value}>
                  {format.label}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={handleTranslate}
            disabled={!selectedFile && !sourceText || translating}
            className="control-button translate-button"
          >
            {translating ? 'Traduction en cours...' : 'Traduire'}
          </button>
        </div>

        <div className="translation-panel">
          <h2 className="panel-title">Traduction</h2>
          
          <div className="translation-container">
            <div className="translation-box">
              <h3 className="translation-box-title">Source</h3>
              <div className="translation-content source">
                <pre>{sourceText}</pre>
              </div>
            </div>

            <div className="translation-box">
              <h3 className="translation-box-title">Traduction</h3>
              <div className="translation-content target">
                <pre>{translationStream}</pre>
              </div>
            </div>
          </div>
        </div>

        {(modelsError || translationError) && (
          <div className="error-message">
            {modelsError || translationError}
            <button onClick={() => {
              setModelsError(null);
              setTranslationError(null);
              if (modelsError) fetchModels();
            }}>
              {modelsError ? 'Réessayer' : '×'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
