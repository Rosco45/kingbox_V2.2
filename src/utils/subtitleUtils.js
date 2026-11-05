/**
 * Utilitaires pour le traitement des sous-titres
 */

/**
 * Convertit un contenu SRT standard en format WebVTT valide
 * @param {string} srtText 
 * @returns {string} vttText
 */
export function srtToVtt(srtText) {
  if (!srtText) return '';
  
  // Remplacer les retours chariot Windows par \n
  let vtt = srtText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  
  // Format des timecodes SRT (00:00:20,000) vers VTT (00:00:20.000)
  vtt = vtt.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
  
  // Si le timecode commence par mm:ss au lieu de hh:mm:ss
  vtt = vtt.replace(/(\d{2}:\d{2}),(\d{3})/g, '00:$1.$2');

  return `WEBVTT\n\n${vtt}`;
}

/**
 * Crée une URL Blob WebVTT à partir d'un fichier (SRT ou VTT) ou d'un texte
 * @param {File|Blob|string} input 
 * @returns {Promise<string>} Blob URL à utiliser dans <track src="...">
 */
export async function createSubtitleBlobUrl(input) {
  let content = '';
  let isSrt = false;

  if (typeof input === 'string') {
    content = input;
    if (content.includes('-->') && !content.trim().startsWith('WEBVTT')) {
      isSrt = true;
    }
  } else if (input instanceof File || input instanceof Blob) {
    content = await input.text();
    if (input.name?.toLowerCase().endsWith('.srt') || (!content.trim().startsWith('WEBVTT') && content.includes('-->'))) {
      isSrt = true;
    }
  }

  const vttContent = isSrt ? srtToVtt(content) : content;
  const blob = new Blob([vttContent], { type: 'text/vtt;charset=utf-8' });
  return URL.createObjectURL(blob);
}
