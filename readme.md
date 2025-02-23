# L.L.M.Trad - Application de Traduction Intelligente

L.L.M.Trad est une application de traduction moderne qui utilise des modèles de langage locaux via Ollama pour fournir des traductions de haute qualité avec une interface utilisateur intuitive.

## Fonctionnalités

- Traduction en temps réel avec streaming
- Support des fichiers texte et PDF
- Interface utilisateur moderne et responsive
- Synchronisation du défilement entre texte source et traduction
- Affichage progressif des traductions
- Intégration native avec Ollama pour les modèles de langage locaux
- Interface claire avec des éléments visuels distinctifs
- Support de multiples modèles de traduction

## Installation

### Prérequis

- Node.js (version 18 ou supérieure)
- npm
- [Ollama](https://ollama.ai/download)

### Étapes d'installation

1. Cloner le dépôt :
```bash
<<<<<<< HEAD
git clone https://github.com/votre-utilisateur/Local.LLM.tradUI.git
=======
git clone https://github.com/fryou12/Local.LLM.tradUI.git
cd book-translator
>>>>>>> f25643c457aaf497da964b20065991a743d152fa
```

2. Installer les dépendances :
```bash
cd Local.LLM.tradUI
# Installation des dépendances du serveur
cd server
npm install
# Installation des dépendances du frontend
cd ../frontend
npm install
```

3. Installer au moins un modèle Ollama :
```bash
ollama pull llama2
```

4. Démarrer les serveurs :
```bash
# Démarrer Ollama (dans un terminal)
ollama serve

# Démarrer le serveur backend (dans un autre terminal)
cd server
npm start

# Démarrer le frontend (dans un troisième terminal)
cd frontend
npm run dev
```

## Utilisation

1. Ouvrez votre navigateur à l'adresse `http://localhost:5173`
2. Sélectionnez un fichier texte ou PDF à traduire
3. Choisissez le mode de traduction (texte ou OCR)
4. Sélectionnez la langue cible
5. Choisissez un modèle Ollama dans la liste
6. Cliquez sur "Traduire" et observez la traduction s'afficher en temps réel

## Technologies Utilisées

- Frontend : React, TypeScript, Vite
- Backend : Node.js, Express
- Modèles de langage : Ollama (local LLM integration)
- Gestion des PDF : pdfjs-dist
- Styles : CSS Modules avec variables personnalisées

## Contribution

Les contributions sont les bienvenues ! Veuillez suivre ces étapes :

1. Forker le projet
2. Créer une branche (`git checkout -b feature/AmazingFeature`)
3. Committer vos changements (`git commit -m 'Add some AmazingFeature'`)
4. Pousser vers la branche (`git push origin feature/AmazingFeature`)
5. Ouvrir une Pull Request

## Licence

<<<<<<< HEAD
Distribué sous la licence MIT. Voir `LICENSE` pour plus d'informations.
=======
MIT
>>>>>>> f25643c457aaf497da964b20065991a743d152fa
