import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';

/**
 * Télécharge réellement un fichier MP4 vers le stockage local de l'appareil
 * et renvoie l'URL locale réelle (file:// ou capacitor:// ou blob:) pour lecture 100% hors-ligne.
 * 
 * @param {string} url - URL source du fichier vidéo
 * @param {string} filename - Nom du fichier de destination
 * @param {Function} onProgress - Callback de progression en temps réel (0 à 100)
 * @returns {Promise<{ uri: string, localPath: string, isNative: boolean, sizeBytes: number }>}
 */
export async function downloadMediaFile(url, filename, onProgress) {
  const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const isNative = Capacitor.isNativePlatform();

  if (isNative) {
    try {
      // 1. Sur Android/iOS : Téléchargement réel vers Directory.Data (espace local persistant de l'application)
      const relativePath = `downloads/${safeFilename}`;
      
      const res = await Filesystem.downloadFile({
        url,
        path: relativePath,
        directory: Directory.Data,
        recursive: true,
        progress: true
      }, (progressEvent) => {
        if (progressEvent.bytes && progressEvent.contentLength && onProgress) {
          const pct = Math.round((progressEvent.bytes / progressEvent.contentLength) * 100);
          onProgress(Math.min(99, pct));
        }
      });

      // Obtenir l'URI locale compatible avec le lecteur vidéo HTML5 WebView
      const uriResult = await Filesystem.getUri({
        directory: Directory.Data,
        path: relativePath
      });

      const convertedUrl = Capacitor.convertFileSrc(uriResult.uri);

      if (onProgress) onProgress(100);

      return {
        uri: convertedUrl,
        localPath: relativePath,
        isNative: true,
        sizeBytes: 0
      };
    } catch (err) {
      console.warn('[Kingbox Downloader] Erreur téléchargement natif Capacitor, bascule fetch:', err);
    }
  }

  // 2. Sur Web (Navigateur PC) : Récupération réelle du stream binaire
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Échec du serveur (${response.status})`);

  const contentLength = response.headers.get('content-length');
  const total = contentLength ? parseInt(contentLength, 10) : 0;

  if (!response.body) {
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    triggerBrowserSave(blob, safeFilename);
    if (onProgress) onProgress(100);
    return { uri: blobUrl, localPath: safeFilename, isNative: false, sizeBytes: blob.size };
  }

  const reader = response.body.getReader();
  let receivedLength = 0;
  const chunks = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    receivedLength += value.length;
    if (total && onProgress) {
      onProgress(Math.min(99, Math.round((receivedLength / total) * 100)));
    }
  }

  const blob = new Blob(chunks, { type: 'video/mp4' });
  const blobUrl = URL.createObjectURL(blob);
  
  // Déclencher le téléchargement navigateur vers le dossier Téléchargements du PC
  triggerBrowserSave(blob, safeFilename);
  
  if (onProgress) onProgress(100);
  return { uri: blobUrl, localPath: safeFilename, isNative: false, sizeBytes: blob.size };
}

/**
 * Supprime un fichier local téléchargé (sur mobile)
 */
export async function deleteLocalMediaFile(localPath) {
  if (Capacitor.isNativePlatform() && localPath) {
    try {
      await Filesystem.deleteFile({
        directory: Directory.Data,
        path: localPath
      });
    } catch (err) {
      console.warn('[Kingbox Downloader] Erreur suppression fichier natif:', err);
    }
  }
}

function triggerBrowserSave(blob, filename) {
  const blobUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    document.body.removeChild(link);
  }, 1500);
}
