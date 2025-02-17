from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import requests
import tempfile
import PyPDF2

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_methods=['*'],
    allow_headers=['*']
)

class TranslationRequest(BaseModel):
    file_path: str
    target_language: str
    model_name: str = 'llama2'
    preserve_layout: bool = True
    context: dict = {}

@app.post('/upload')
async def upload_pdf(file: UploadFile = File(...)):
    with tempfile.NamedTemporaryFile(delete=False) as tmp:
        content = await file.read()
        tmp.write(content)
        return {'file_path': tmp.name}

@app.post('/translate')
async def translate_pdf(request: TranslationRequest):
    # Extraction du texte avec préservation de la mise en page
    with open(request.file_path, 'rb') as f:
        reader = PyPDF2.PdfReader(f)
        text = '\n'.join([page.extract_text() for page in reader.pages])
    
    # Appel à Ollama pour la traduction
    response = requests.post(
        'http://localhost:11434/api/generate',
        json={
            'model': request.model_name,
            'prompt': f"Traduis ce texte en {request.target_language} en conservant la mise en page:\n{text}",
            'options': {
                'temperature': 0.3,
                'max_tokens': 4000
            }
        }
    )
    
    return {'translation': response.json()['response']}

@app.get('/models')
async def get_available_models():
    response = requests.get('http://localhost:11434/api/tags')
    return response.json()
