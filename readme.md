# Book Translator

Une application web pour traduire des livres au format PDF et TXT en utilisant des modèles d'IA locaux via Ollama.

## Fonctionnalités

- 📚 Support des formats PDF et TXT
- 🤖 Traduction avec des modèles d'IA locaux via Ollama
- 📊 Suivi en temps réel de la progression de la traduction
- ⏱️ Estimation du temps restant
- 💾 Conservation des fichiers traduits
- 🔄 Découpage intelligent du texte pour une meilleure qualité de traduction
- 🌐 Interface utilisateur moderne et réactive

## Prérequis

1. Node.js v18 ou supérieur
2. [Ollama](https://ollama.ai/) installé et configuré
3. Au moins un modèle de langage installé via Ollama (par exemple : mistral, llama2)

## Dépendances

Pour exécuter ce projet, vous aurez besoin des dépendances suivantes :

- fastapi==0.109.0
- uvicorn[standard]==0.27.1
- python-multipart==0.0.9
- PyPDF2==3.0.1
- requests==2.31.0
- python-dotenv==1.0.1
- sqlalchemy==2.0.28
- psycopg2-binary==2.9.9
- chromadb==0.4.22
- sentence-transformers==2.6.1
- httpx==0.27.0
- aiofiles==23.2.1
- python-dateutil==2.9.0.post0
- uvloop==0.19.0
- watchfiles==0.21.0
- pandas==2.1.4
- numpy==1.24.4

## Installation

1. Cloner le dépôt :
```bash
git clone git@github.com:fryou12/Local.LLM.tradUI.git
cd book-translator
```

2. Installer les dépendances du backend :
```bash
cd server
npm install
```

3. Installer les dépendances du frontend :
```bash
cd ../frontend
npm install
```

## Configuration

1. Assurez-vous qu'Ollama est en cours d'exécution :
```bash
ollama serve
```

2. Installez au moins un modèle de langage :
```bash
ollama pull mistral
```

## Utilisation

1. Démarrer le serveur backend (depuis le dossier `server`) :
```bash
npm run start
```

2. Démarrer le frontend (depuis le dossier `frontend`) :
```bash
npm run dev
```

3. Ouvrez votre navigateur à l'adresse indiquée par le frontend (généralement http://localhost:5173)

4. Dans l'interface :
   - Sélectionnez un fichier PDF ou TXT à traduire
   - Choisissez la langue cible
   - Sélectionnez le modèle de traduction
   - Cliquez sur "Traduire"
   - Suivez la progression en temps réel
   - Une fois terminé, le fichier traduit sera téléchargé automatiquement

## Structure des fichiers

```
book-translator/
├── frontend/               # Application React
│   ├── src/
│   │   ├── App.tsx        # Composant principal
│   │   └── ...
│   └── package.json
├── server/                 # Serveur Node.js
│   ├── src/
│   │   ├── index.ts       # Point d'entrée
│   │   ├── services/      # Services métier
│   │   └── utils/         # Utilitaires
│   ├── uploads/           # Fichiers uploadés
│   │   └── translations/  # Fichiers traduits
│   └── package.json
└── README.md
```

## Fonctionnement

1. **Extraction du texte** :
   - Le texte est extrait du fichier PDF ou TXT
   - Pour les PDFs, utilisation de pdf-parse
   - Le texte est découpé en chunks intelligents pour respecter le contexte

2. **Traduction** :
   - Chaque chunk est traduit séparément
   - Le contexte est maintenu entre les chunks
   - Progression en temps réel avec estimation du temps restant

3. **Sauvegarde** :
   - Les fichiers traduits sont sauvegardés dans `server/uploads/translations/`
   - Les fichiers sources temporaires sont automatiquement nettoyés

## Limitations actuelles

- Le mode OCR pour les PDFs n'est pas encore implémenté
- La traduction est unidirectionnelle (vers la langue cible uniquement)
- Les fichiers PDF sont sauvegardés en format TXT

## Contribuer

Les contributions sont les bienvenues ! N'hésitez pas à :
1. Fork le projet
2. Créer une branche pour votre fonctionnalité
3. Commiter vos changements
4. Pousser vers la branche
5. Ouvrir une Pull Request

## Licence

MIT