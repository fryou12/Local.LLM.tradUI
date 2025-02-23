import express from 'express';
import multer from 'multer';
import { PDFDocument } from 'pdf-lib';
import * as pdfjs from 'pdfjs-dist';

const router = express.Router();
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

router.post('/extract-text', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        error: 'Aucun fichier fourni' 
      });
    }

    const data = new Uint8Array(req.file.buffer);
    const doc = await pdfjs.getDocument({ data }).promise;
    
    let fullText = '';
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item: any) => item.str)
        .join(' ');
      fullText += pageText + '\n';
    }

    res.json({ 
      success: true, 
      text: fullText.trim() 
    });
  } catch (error) {
    console.error('Erreur lors de l\'extraction du texte:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erreur lors de l\'extraction du texte du PDF' 
    });
  }
});

export default router;
