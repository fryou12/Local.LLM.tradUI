import { existsSync, promises as fs } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import { debugLog } from '../utils/logger';

const CACHE_DIR = join(__dirname, '../../../.translation-cache');
const MAX_CACHE_SIZE_MB = parseInt(process.env.TRANSLATION_CACHE_SIZE_MB || '100', 10);

interface CacheStats {
  hits: number;
  misses: number;
  size: number;
}

let cacheStats: CacheStats = {
  hits: 0,
  misses: 0,
  size: 0
};

export function getCacheStats(): CacheStats {
  return { ...cacheStats };
}

function generateTextHash(text: string, lang: string): string {
  return createHash('sha1')
    .update(`${lang}-${text.trim()}`)
    .digest('hex');
}

async function manageCacheStorage(): Promise<void> {
  try {
    const files = await fs.readdir(CACHE_DIR);
    let totalSize = 0;
    
    const fileStats = await Promise.all(
      files.map(async file => {
        const stats = await fs.stat(join(CACHE_DIR, file));
        return { file, mtime: stats.mtimeMs, size: stats.size };
      })
    );

    totalSize = fileStats.reduce((acc, { size }) => acc + size, 0);
    cacheStats.size = totalSize;
    
    if (totalSize > MAX_CACHE_SIZE_MB * 1024 * 1024) {
      debugLog(`Cache trop grand (${(totalSize / 1024 / 1024).toFixed(2)}MB), nettoyage...`);
      
      // Trier par date d'accès et supprimer les 20% plus anciens
      fileStats.sort((a, b) => a.mtime - b.mtime);
      const filesToRemove = fileStats.slice(0, Math.ceil(files.length * 0.2));
      
      for (const { file, size } of filesToRemove) {
        await fs.unlink(join(CACHE_DIR, file));
        cacheStats.size -= size;
        debugLog(`Cache: suppression de ${file}`);
      }
    }
  } catch (error) {
    debugLog('Erreur lors du nettoyage du cache:', error);
  }
}

export async function getCachedTranslation(text: string, lang: string): Promise<string | null> {
  const hash = generateTextHash(text, lang);
  const cachePath = join(CACHE_DIR, `${hash}.txt`);
  
  try {
    if (existsSync(cachePath)) {
      const content = await fs.readFile(cachePath, 'utf-8');
      await fs.utimes(cachePath, new Date(), new Date());
      cacheStats.hits++;
      debugLog(`Cache hit: ${hash.substring(0, 8)}...`);
      return content;
    }
  } catch (error) {
    debugLog('Erreur lors de la lecture du cache:', error);
  }
  
  cacheStats.misses++;
  return null;
}

export async function cacheTranslation(text: string, lang: string, translation: string): Promise<void> {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    const hash = generateTextHash(text, lang);
    const cachePath = join(CACHE_DIR, `${hash}.txt`);
    
    await fs.writeFile(cachePath, translation);
    debugLog(`Cache: nouvelle entrée ${hash.substring(0, 8)}...`);
    
    // Mettre à jour les stats et gérer l'espace
    const stats = await fs.stat(cachePath);
    cacheStats.size += stats.size;
    await manageCacheStorage();
    
  } catch (error) {
    debugLog('Erreur lors de l\'écriture dans le cache:', error);
  }
}

// Initialisation du cache au démarrage
export async function initializeCache(): Promise<void> {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    debugLog(`Cache initialisé dans ${CACHE_DIR}`);
    await manageCacheStorage();
  } catch (error) {
    debugLog('Erreur lors de l\'initialisation du cache:', error);
  }
}
