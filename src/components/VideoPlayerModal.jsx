import React, { useRef, useState, useEffect, useCallback } from 'react';
import Hls from 'hls.js';
import { 
  X, Play, Pause, Volume2, VolumeX, Maximize, RotateCcw, Download, 
  AlertCircle, ShieldCheck, ShieldOff, Subtitles, Check, Globe, Server,
  Loader2, ChevronLeft, ChevronRight, Gauge, Upload, Link as LinkIcon,
  Cast
} from 'lucide-react';
import { 
  AUDIO_LANGUAGES, 
  FRANIME_HOSTERS, 
  resolveHosterEmbedUrl, 
  resolveAnimeIds,
  getSyncAnimeIds,
  fetchDynamicFranimeLinks,
  resolveRealDownload,
  buildDownloadStreamUrl
} from '../utils/franimeHosters';
import { createSubtitleBlobUrl } from '../utils/subtitleUtils';

const PLAYBACK_RATES = [0.75, 1, 1.25, 1.5, 2];

export default function VideoPlayerModal({ media, onClose, onDownload, onProgress }) {
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const fileInputRef = useRef(null);

  // Préférences utilisateur persistées
  const [playbackRate, setPlaybackRate] = useState(() => {
    return parseFloat(localStorage.getItem('kingbox_player_rate')) || 1;
  });
  const [savedVolume, setSavedVolume] = useState(() => {
    const v = localStorage.getItem('kingbox_player_volume');
    return v !== null ? parseFloat(v) : 1;
  });

  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [selectedLocalSourceId, setSelectedLocalSourceId] = useState(media?.selectedSourceId || media?.localSources?.[0]?.id || '');
  const lastProgressSave = useRef(0);

  // Langue & Hébergeur sans pub
  const [selectedLang, setSelectedLang] = useState(() => {
    return media?.preferredLang || localStorage.getItem('kingbox_preferred_lang') || 'vf';
  });
  const [currentHoster, setCurrentHoster] = useState(media?.preferredHoster || 'sibnet');
  const [blockedPopupsCount, setBlockedPopupsCount] = useState(0);
  const [iframeLoading, setIframeLoading] = useState(true);

  // Épisode actif
  const [activeSeason, setActiveSeason] = useState(media?.currentEpisode?.season || 1);
  const [activeEpisodeNum, setActiveEpisodeNum] = useState(media?.currentEpisode?.number || 1);
  const [activeEpisodeTitle, setActiveEpisodeTitle] = useState(media?.currentEpisode?.title || 'Épisode 1');

  // Identifiants & résolutions dynamiques
  const [resolvedIds, setResolvedIds] = useState(() => getSyncAnimeIds(media));
  const [dynamicFranimeHosters, setDynamicFranimeHosters] = useState(null);
  const [resolvedDirectInfo, setResolvedDirectInfo] = useState(null);

  // Bouclier Sandbox
  const [isSandboxEnabled, setIsSandboxEnabled] = useState(false);
  const [shieldToast, setShieldToast] = useState(null);

  // Contrôles & Menus
  const [showControls, setShowControls] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [showSubMenu, setShowSubMenu] = useState(false);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [hlsEngineStatus, setHlsEngineStatus] = useState('idle'); // 'idle' | 'hlsjs' | 'native' | 'error'
  const controlsTimeout = useRef(null);

  // Pistes de sous-titres
  const [subtitleTracks, setSubtitleTracks] = useState([]);
  const [selectedSubId, setSelectedSubId] = useState('off');
  const [customSubUrl, setCustomSubUrl] = useState('');
  const [showUrlInput, setShowUrlInput] = useState(false);

  // Gestes tactiles mobiles
  const [touchFeedback, setTouchFeedback] = useState(null); // { type: 'rewind'|'forward'|'volume', text: string }
  const lastTapRef = useRef({ time: 0, x: 0 });
  const touchFeedbackTimeout = useRef(null);

  const isTv = media?.type === 'tv' || media?.type === 'anime';
  const isAnime = media?.type === 'anime';
  const tmdbId = media?.tmdbId || null;

  // Initialisation à l'ouverture du média
  useEffect(() => {
    if (!media) return;
    const initLang = media.preferredLang || localStorage.getItem('kingbox_preferred_lang') || 'vf';
    const initHoster = media.preferredHoster || (media.isAdult && !media.tmdbId && !media.malId && !media.anilistId ? 'direct' : 'sibnet');
    setSelectedLocalSourceId(media.selectedSourceId || media.localSources?.[0]?.id || '');
    setCurrentTime(Number(media.resumeAt) || 0);
    setDuration(0);
    lastProgressSave.current = 0;
    setSelectedLang(initLang);
    const preferredLocalSource = media.localSources?.find(source => source.id === media.selectedSourceId) || media.localSources?.[0];
    setCurrentHoster(
      preferredLocalSource?.format === 'iframe' ? 'custom-iframe'
        : preferredLocalSource ? 'direct'
          : media.playbackType === 'iframe' ? 'custom-iframe' : media.playbackType ? 'direct' : initHoster
    );
    setActiveSeason(media.currentEpisode?.season || 1);
    setActiveEpisodeNum(media.currentEpisode?.number || 1);
    setActiveEpisodeTitle(media.currentEpisode?.title || `Épisode ${media.currentEpisode?.number || 1}`);
    setResolvedIds(getSyncAnimeIds(media));
    setIframeLoading(true);
    setHasError(false);
    setSelectedSubId('off');
  }, [media]);

  // Synchronisation Anime IDs
  useEffect(() => {
    let mounted = true;
    if (media && (isAnime || !media.tmdbId)) {
      const sync = getSyncAnimeIds(media);
      if (sync.anilistId || sync.malId) {
        setResolvedIds(sync);
      } else {
        resolveAnimeIds(media).then((ids) => {
          if (mounted && (ids.anilistId || ids.malId)) {
            setResolvedIds(ids);
          }
        });
      }
    }
    return () => { mounted = false; };
  }, [media, isAnime]);

  // Liens dynamiques FRAnime
  useEffect(() => {
    let mounted = true;
    setDynamicFranimeHosters(null);
    if (media && isAnime && selectedLang !== 'vo') {
      fetchDynamicFranimeLinks({
        tmdbId,
        title: media.title,
        originalTitle: media.originalTitle,
        season: activeSeason,
        episode: activeEpisodeNum,
        lang: selectedLang
      }).then((hosters) => {
        if (mounted && hosters) {
          setDynamicFranimeHosters(hosters);
        }
      });
    }
    return () => { mounted = false; };
  }, [media, isAnime, tmdbId, activeSeason, activeEpisodeNum, selectedLang]);

  // Résolution flux MP4 direct
  useEffect(() => {
    let mounted = true;
    setResolvedDirectInfo(null);
    if (media) {
      resolveRealDownload({
        media,
        episode: isTv ? { number: activeEpisodeNum, season: activeSeason } : null,
        lang: selectedLang,
        waitUqload: false
      }).then((info) => {
        if (mounted && info && info.found) {
          setResolvedDirectInfo(info);
        }
      });
    }
    return () => { mounted = false; };
  }, [media, isTv, activeSeason, activeEpisodeNum, selectedLang]);

  const currentHosterObj = FRANIME_HOSTERS.find((h) => h.id === currentHoster) || FRANIME_HOSTERS[0];
  const currentLangObj = AUDIO_LANGUAGES.find((l) => l.id === selectedLang) || AUDIO_LANGUAGES[0];

  const localSources = Array.isArray(media?.localSources) ? media.localSources : [];
  const activeLocalSource = localSources.find(source => source.id === selectedLocalSourceId) || null;

  const embedUrl = activeLocalSource?.format === 'iframe'
    ? activeLocalSource.url
    : media?.playbackType === 'iframe' && media?.videoUrl ? media.videoUrl : resolveHosterEmbedUrl({
    hosterId: currentHoster,
    lang: selectedLang,
    tmdbId,
    anilistId: resolvedIds.anilistId || media?.anilistId,
    malId: resolvedIds.malId || media?.malId,
    isTv,
    isAnime,
    isAdult: media?.isAdult,
    season: activeSeason,
    episode: activeEpisodeNum,
    customHosters: media?.hosters,
    dynamicFranimeHosters
  });

  const effectiveSandbox = isSandboxEnabled && currentHosterObj.supportsSandbox;

  // Calcul de l'URL vidéo directe
  const directVideoUrl =
    (activeLocalSource && activeLocalSource.format !== 'iframe' ? activeLocalSource.url : null) ||
    (media?.playbackType && media?.playbackType !== 'iframe' ? media?.videoUrl : null) ||
    media?.directMp4Url ||
    dynamicFranimeHosters?.directMp4 ||
    resolvedDirectInfo?.directMp4Url ||
    (resolvedDirectInfo ? buildDownloadStreamUrl(resolvedDirectInfo, 'Kingbox_Direct.mp4') : null) ||
    media?.downloadStreamUrl ||
    null;

  const isHlsStream = directVideoUrl && (
    directVideoUrl.includes('.m3u8') || 
    activeLocalSource?.format === 'hls' ||
    resolvedDirectInfo?.hlsUrl === directVideoUrl
  );

  // Initialisation et gestion HLS.js avec repli natif
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !directVideoUrl) return;

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (isHlsStream) {
      if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: true,
          backBufferLength: 90
        });
        hls.loadSource(directVideoUrl);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          setHlsEngineStatus('hlsjs');
          setHasError(false);
          restorePosition();
          if (isPlaying) video.play().catch(() => {});
        });
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (data.fatal) {
            console.warn('[Kingbox HLS.js] Fatal error:', data.type);
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                hls.startLoad();
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                hls.recoverMediaError();
                break;
              default:
                hls.destroy();
                setHlsEngineStatus('error');
                setHasError(true);
                break;
            }
          }
        });
        hlsRef.current = hls;
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = directVideoUrl;
        setHlsEngineStatus('native');
      } else {
        setHlsEngineStatus('error');
        setHasError(true);
      }
    } else {
      video.src = directVideoUrl;
      setHlsEngineStatus('idle');
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [directVideoUrl, isHlsStream]);

  // Appliquer volume et vitesse mémorisés
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = savedVolume;
      videoRef.current.playbackRate = playbackRate;
    }
  }, [savedVolume, playbackRate, directVideoUrl]);

  // Changement de vitesse de lecture
  const handleRateChange = (rate) => {
    setPlaybackRate(rate);
    localStorage.setItem('kingbox_player_rate', rate.toString());
    if (videoRef.current) videoRef.current.playbackRate = rate;
    setShowSpeedMenu(false);
    triggerTouchFeedback('speed', `${rate}x`);
  };

  // Interception anti-popup
  useEffect(() => {
    const originalWindowOpen = window.open;
    window.open = function () {
      setBlockedPopupsCount((prev) => prev + 1);
      return null;
    };
    return () => {
      window.open = originalWindowOpen;
    };
  }, []);

  const triggerTouchFeedback = (type, text) => {
    setTouchFeedback({ type, text });
    clearTimeout(touchFeedbackTimeout.current);
    touchFeedbackTimeout.current = setTimeout(() => setTouchFeedback(null), 800);
  };

  const handleLanguageSwitch = (langId) => {
    setSelectedLang(langId);
    localStorage.setItem('kingbox_preferred_lang', langId);
    setHasError(false);
    setIframeLoading(true);
    setShieldToast(`🎧 Audio basculé sur ${langId.toUpperCase()}`);
  };

  const handleHosterSwitch = (hosterId) => {
    const targetObj = FRANIME_HOSTERS.find((h) => h.id === hosterId);
    if (isSandboxEnabled && targetObj && !targetObj.supportsSandbox) {
      setIsSandboxEnabled(false);
      setShieldToast(`🔓 Mode Compatible pour ${targetObj.name}.`);
    }
    setCurrentHoster(hosterId);
    setHasError(false);
    setIframeLoading(true);
  };

  const handleEpisodeStep = (delta) => {
    const nextEp = Math.max(1, activeEpisodeNum + delta);
    if (nextEp === activeEpisodeNum) return;
    setActiveEpisodeNum(nextEp);
    const foundEp = media?.episodes?.find((e) => e.number === nextEp);
    setActiveEpisodeTitle(foundEp?.title || `Épisode ${nextEp}`);
    setIframeLoading(true);
    setHasError(false);
  };

  const togglePlay = () => {
    if (videoRef.current) {
      if (videoRef.current.paused) {
        videoRef.current.play();
        setIsPlaying(true);
      } else {
        videoRef.current.pause();
        setIsPlaying(false);
      }
    }
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted;
      setIsMuted(videoRef.current.muted);
    }
  };

  const handleVolumeChange = (newVol) => {
    const clamped = Math.max(0, Math.min(1, newVol));
    setSavedVolume(clamped);
    localStorage.setItem('kingbox_player_volume', clamped.toString());
    if (videoRef.current) {
      videoRef.current.volume = clamped;
      videoRef.current.muted = clamped === 0;
      setIsMuted(clamped === 0);
    }
    triggerTouchFeedback('volume', `${Math.round(clamped * 100)}%`);
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      const position = videoRef.current.currentTime || 0;
      const total = Number.isFinite(videoRef.current.duration) ? videoRef.current.duration : 0;
      setCurrentTime(position);
      setDuration(total);
      if (onProgress && Date.now() - lastProgressSave.current > 10000) {
        lastProgressSave.current = Date.now();
        const progressMedia = isTv ? { ...media, currentEpisode: { season: activeSeason, number: activeEpisodeNum, title: activeEpisodeTitle } } : media;
        onProgress({ media: progressMedia, position, duration: total });
      }
    }
  };

  const saveAndClose = () => {
    if (videoRef.current && onProgress) {
      const progressMedia = isTv ? { ...media, currentEpisode: { season: activeSeason, number: activeEpisodeNum, title: activeEpisodeTitle } } : media;
      onProgress({ media: progressMedia, position: videoRef.current.currentTime || 0, duration: videoRef.current.duration || 0 });
    }
    onClose?.();
  };

  const restorePosition = () => {
    const startAt = Math.max(0, Number(media?.resumeAt) || 0);
    if (videoRef.current && startAt > 5 && startAt < (videoRef.current.duration || Infinity) - 10) {
      videoRef.current.currentTime = startAt;
      setCurrentTime(startAt);
    }
  };

  const handleSeek = (e) => {
    const time = parseFloat(e.target.value);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const toggleFullScreen = () => {
    const elem = document.getElementById('kingbox-player-container');
    if (!document.fullscreenElement) {
      elem?.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  };

  // Support Remote Playback / Cast
  const handleRemotePlayback = () => {
    if (videoRef.current?.remote?.prompt) {
      videoRef.current.remote.prompt().catch(() => {});
    } else {
      setShieldToast('Fonction Cast / AirPlay disponible sur navigateur compatible.');
    }
  };

  // Gestion des sous-titres
  const handleFileUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const blobUrl = await createSubtitleBlobUrl(file);
      const newTrack = {
        id: `local_${Date.now()}`,
        label: file.name.replace(/\.[^/.]+$/, ''),
        src: blobUrl,
        lang: 'fr'
      };
      setSubtitleTracks((prev) => [...prev, newTrack]);
      setSelectedSubId(newTrack.id);
      setShowSubMenu(false);
      setShieldToast(`Sous-titres chargés : ${newTrack.label}`);
    } catch {
      setShieldToast('Erreur lors du chargement du fichier de sous-titres.');
    }
  };

  const handleAddSubUrl = async () => {
    if (!customSubUrl.trim()) return;
    try {
      const res = await fetch(customSubUrl);
      const text = await res.text();
      const blobUrl = await createSubtitleBlobUrl(text);
      const newTrack = {
        id: `url_${Date.now()}`,
        label: 'Sous-titres URL',
        src: blobUrl,
        lang: 'fr'
      };
      setSubtitleTracks((prev) => [...prev, newTrack]);
      setSelectedSubId(newTrack.id);
      setCustomSubUrl('');
      setShowUrlInput(false);
      setShowSubMenu(false);
      setShieldToast('Piste de sous-titres URL activée.');
    } catch {
      setShieldToast('Impossible de récupérer les sous-titres depuis cette URL (vérifier CORS).');
    }
  };

  // Double-tap tactile (-10s / +10s)
  const handleTouchStart = (e) => {
    const now = Date.now();
    const touch = e.touches[0];
    const rect = e.currentTarget.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const isLeftSide = x < rect.width / 2;

    if (now - lastTapRef.current.time < 300) {
      // Double tap détecté !
      if (videoRef.current) {
        if (isLeftSide) {
          videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 10);
          triggerTouchFeedback('rewind', '-10s');
        } else {
          videoRef.current.currentTime = Math.min(videoRef.current.duration || Infinity, videoRef.current.currentTime + 10);
          triggerTouchFeedback('forward', '+10s');
        }
      }
      lastTapRef.current = { time: 0, x: 0 };
    } else {
      lastTapRef.current = { time: now, x };
    }
  };

  // Raccourcis clavier complets
  useEffect(() => {
    const onKeyDown = (event) => {
      const target = event.target;
      if (target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (event.key === 'Escape') { saveAndClose(); return; }
      if (event.key === ' ' || event.key.toLowerCase() === 'k') {
        event.preventDefault(); togglePlay();
      } else if (event.key === 'ArrowRight' && videoRef.current) {
        videoRef.current.currentTime = Math.min(videoRef.current.duration || Infinity, videoRef.current.currentTime + 10);
        triggerTouchFeedback('forward', '+10s');
      } else if (event.key === 'ArrowLeft' && videoRef.current) {
        videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 10);
        triggerTouchFeedback('rewind', '-10s');
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        handleVolumeChange(savedVolume + 0.1);
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        handleVolumeChange(savedVolume - 0.1);
      } else if (event.key.toLowerCase() === 'm') {
        toggleMute();
      } else if (event.key.toLowerCase() === 'f') {
        toggleFullScreen();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [savedVolume]);

  const formatTime = (secs) => {
    if (isNaN(secs)) return "00:00";
    const minutes = Math.floor(secs / 60);
    const seconds = Math.floor(secs % 60);
    return `${minutes < 10 ? '0' : ''}${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  if (!media) return null;

  return (
    <div 
      id="kingbox-player-container"
      className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center select-none overflow-hidden"
    >
      {/* Top Header Bar */}
      <div className="absolute top-0 left-0 right-0 z-30 flex flex-col gap-2 p-2.5 sm:p-4 bg-gradient-to-b from-black/95 via-black/90 to-transparent">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Titre & Épisodes */}
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm sm:text-lg font-extrabold text-white line-clamp-1">
                {media.title}
              </h2>
              {isTv && (
                <div className="flex items-center space-x-1 bg-zinc-900/90 border border-zinc-700/80 rounded-lg px-2 py-0.5">
                  <button
                    onClick={() => handleEpisodeStep(-1)}
                    disabled={activeEpisodeNum <= 1}
                    className="text-zinc-400 hover:text-white disabled:opacity-30 p-0.5"
                    title="Épisode précédent"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-red-400 text-xs font-extrabold px-1">
                    S{activeSeason}:E{activeEpisodeNum}
                  </span>
                  <button
                    onClick={() => handleEpisodeStep(1)}
                    className="text-zinc-400 hover:text-white p-0.5"
                    title="Épisode suivant"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 text-[10px] sm:text-xs">
              {currentHoster === 'direct' ? (
                <span className="flex items-center space-x-1 px-2.5 py-0.5 rounded-full border border-emerald-500/40 bg-emerald-500/20 text-emerald-300 font-bold">
                  <span>Moteur : {hlsEngineStatus === 'hlsjs' ? 'HLS.js Direct Engine' : hlsEngineStatus === 'native' ? 'HLS Natif' : 'HTML5 MP4 Direct'}</span>
                </span>
              ) : (
                <button
                  onClick={() => setIsSandboxEnabled(!isSandboxEnabled)}
                  className={`flex items-center space-x-1 px-2.5 py-0.5 rounded-full border font-bold transition-all cursor-pointer ${
                    effectiveSandbox
                      ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/30'
                      : 'bg-amber-500/15 border-amber-500/40 text-amber-300 hover:bg-amber-500/25'
                  }`}
                >
                  {effectiveSandbox ? <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> : <ShieldOff className="w-3.5 h-3.5 text-amber-400" />}
                  <span>{effectiveSandbox ? `Bouclier ON (${currentHosterObj.name})` : `Bouclier OFF (${currentHosterObj.name})`}</span>
                </button>
              )}
              <span className="text-zinc-500 hidden sm:inline">•</span>
              <span className="text-zinc-300 font-semibold">
                Version : <strong className="text-red-400 uppercase">{currentLangObj.flag} {currentLangObj.label}</strong>
              </span>
            </div>
          </div>

          {/* Contrôles du Header Droit */}
          <div className="flex items-center space-x-2">
            {/* Sélecteur de Langue */}
            <div className="flex items-center bg-zinc-900/95 p-1 rounded-xl border border-zinc-700/80 text-xs">
              {AUDIO_LANGUAGES.map((lang) => (
                <button
                  key={lang.id}
                  onClick={() => handleLanguageSwitch(lang.id)}
                  className={`flex items-center space-x-1 px-2.5 py-1 rounded-lg text-[11px] font-extrabold transition-all ${
                    selectedLang === lang.id
                      ? 'bg-red-600 text-white shadow-md scale-105'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                  title={lang.fullLabel}
                >
                  <span>{lang.flag}</span>
                  <span>{lang.label}</span>
                </button>
              ))}
            </div>

            {/* Menu Vitesse de lecture (Direct) */}
            {currentHoster === 'direct' && (
              <div className="relative">
                <button
                  onClick={() => setShowSpeedMenu(!showSpeedMenu)}
                  className={`px-2.5 py-1.5 rounded-xl border text-xs font-extrabold transition-colors flex items-center space-x-1 ${
                    playbackRate !== 1 ? 'bg-red-600 border-red-500 text-white' : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:text-white'
                  }`}
                  title="Vitesse de lecture"
                >
                  <Gauge className="w-3.5 h-3.5" />
                  <span>{playbackRate}x</span>
                </button>
                {showSpeedMenu && (
                  <div className="absolute right-0 top-11 w-32 bg-zinc-900/95 border border-zinc-700 rounded-2xl p-1.5 shadow-2xl backdrop-blur-xl z-50 space-y-1">
                    {PLAYBACK_RATES.map((rate) => (
                      <button
                        key={rate}
                        onClick={() => handleRateChange(rate)}
                        className={`w-full text-left px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center justify-between ${
                          playbackRate === rate ? 'bg-red-600 text-white' : 'text-zinc-300 hover:bg-zinc-800'
                        }`}
                      >
                        <span>{rate}x</span>
                        {playbackRate === rate && <Check className="w-3.5 h-3.5" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Menu Sous-titres (Direct & External) */}
            <div className="relative">
              <button
                onClick={() => setShowSubMenu(!showSubMenu)}
                className={`p-2 rounded-full transition-colors border ${
                  selectedSubId !== 'off' 
                    ? 'bg-red-600/20 border-red-500 text-red-400' 
                    : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:text-white'
                }`}
                title="Pistes de sous-titres (VTT / SRT)"
              >
                <Subtitles className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>

              {showSubMenu && (
                <div className="absolute right-0 top-11 w-64 bg-zinc-900/95 border border-zinc-700 rounded-2xl p-2.5 shadow-2xl backdrop-blur-xl z-50 space-y-2">
                  <div className="px-2 py-1 border-b border-zinc-800 text-[11px] font-bold text-zinc-400 uppercase tracking-wider flex items-center justify-between">
                    <span>Sous-titres</span>
                    <Globe className="w-3.5 h-3.5 text-zinc-400" />
                  </div>

                  <button
                    onClick={() => { setSelectedSubId('off'); setShowSubMenu(false); }}
                    className={`w-full text-left px-3 py-2 rounded-xl text-xs font-medium flex items-center justify-between ${
                      selectedSubId === 'off' ? 'bg-red-600 text-white font-bold' : 'text-zinc-300 hover:bg-zinc-800'
                    }`}
                  >
                    <span>Désactivés</span>
                    {selectedSubId === 'off' && <Check className="w-3.5 h-3.5" />}
                  </button>

                  {subtitleTracks.map((track) => (
                    <button
                      key={track.id}
                      onClick={() => { setSelectedSubId(track.id); setShowSubMenu(false); }}
                      className={`w-full text-left px-3 py-2 rounded-xl text-xs font-medium flex items-center justify-between ${
                        selectedSubId === track.id ? 'bg-red-600 text-white font-bold' : 'text-zinc-300 hover:bg-zinc-800'
                      }`}
                    >
                      <span className="truncate pr-2">{track.label}</span>
                      {selectedSubId === track.id && <Check className="w-3.5 h-3.5 shrink-0" />}
                    </button>
                  ))}

                  <div className="pt-2 border-t border-zinc-800 space-y-1.5">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".vtt,.srt"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full py-1.5 px-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl text-xs font-semibold flex items-center justify-center space-x-1.5"
                    >
                      <Upload className="w-3.5 h-3.5 text-amber-400" />
                      <span>Importer fichier .srt / .vtt</span>
                    </button>

                    {showUrlInput ? (
                      <div className="flex items-center space-x-1 pt-1">
                        <input
                          type="url"
                          placeholder="https://.../sub.vtt"
                          value={customSubUrl}
                          onChange={(e) => setCustomSubUrl(e.target.value)}
                          className="flex-1 bg-zinc-950 border border-zinc-700 rounded-lg px-2 py-1 text-xs text-white"
                        />
                        <button
                          onClick={handleAddSubUrl}
                          className="bg-red-600 hover:bg-red-500 text-white px-2 py-1 rounded-lg text-xs font-bold"
                        >
                          OK
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setShowUrlInput(true)}
                        className="w-full py-1.5 px-3 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 rounded-xl text-xs flex items-center justify-center space-x-1.5 border border-zinc-800"
                      >
                        <LinkIcon className="w-3.5 h-3.5" />
                        <span>Ajouter via URL</span>
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Cast / Remote Playback */}
            {currentHoster === 'direct' && (
              <button
                onClick={handleRemotePlayback}
                className="p-2 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors border border-zinc-700"
                title="Diffuser (AirPlay / Chromecast)"
              >
                <Cast className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            )}

            {/* Téléchargement Rapide */}
            {onDownload && (
              <button
                onClick={() => onDownload(media, { season: activeSeason, number: activeEpisodeNum, title: activeEpisodeTitle })}
                className="p-2 rounded-full bg-zinc-800 hover:bg-zinc-700 text-amber-300 hover:text-amber-200 transition-colors border border-amber-500/30"
                title="Télécharger cette vidéo"
              >
                <Download className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            )}

            {/* Fermer */}
            <button
              onClick={saveAndClose}
              className="p-2 rounded-full bg-zinc-800 hover:bg-zinc-700 text-white transition-colors"
              title="Quitter le lecteur"
            >
              <X className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>
          </div>
        </div>

        {/* Ligne Hébergeurs Sans Pub */}
        {!media?.playbackType && (
          <div className="flex items-center space-x-1.5 overflow-x-auto no-scrollbar py-1">
            <div className="flex items-center space-x-1 text-[11px] font-bold text-zinc-400 shrink-0 pr-1">
              <Server className="w-3.5 h-3.5 text-emerald-400" />
              <span>Lecteurs :</span>
            </div>
            {FRANIME_HOSTERS.map((hoster) => {
              const active = currentHoster === hoster.id;
              return (
                <button
                  key={hoster.id}
                  onClick={() => handleHosterSwitch(hoster.id)}
                  className={`flex items-center space-x-1.5 px-3 py-1 rounded-xl text-xs font-bold whitespace-nowrap transition-all border ${
                    active
                      ? 'bg-red-600 border-red-500 text-white shadow-md shadow-red-600/30 scale-105'
                      : 'bg-zinc-900/90 border-zinc-700/80 text-zinc-300 hover:text-white hover:bg-zinc-800'
                  }`}
                  title={hoster.description}
                >
                  <span>{hoster.name}</span>
                  <span className={`text-[9px] px-1.5 py-0.2 rounded font-extrabold ${
                    active ? 'bg-black/30 text-amber-200' : 'bg-emerald-500/15 text-emerald-400'
                  }`}>
                    {hoster.badge}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Sources locales personnalisées */}
        {localSources.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
            <span className="shrink-0 text-[11px] font-bold text-emerald-300">Mes sources :</span>
            {localSources.map(source => (
              <button
                key={source.id}
                onClick={() => {
                  setSelectedLocalSourceId(source.id);
                  setCurrentHoster(source.format === 'iframe' ? 'custom-iframe' : 'direct');
                  setHasError(false);
                  setIframeLoading(source.format === 'iframe');
                }}
                className={`shrink-0 rounded-lg border px-3 py-1 text-[11px] font-bold ${
                  selectedLocalSourceId === source.id ? 'border-emerald-500 bg-emerald-500/20 text-emerald-200' : 'border-zinc-700 bg-zinc-900 text-zinc-300 hover:text-white'
                }`}
              >
                {source.title} · {source.format.toUpperCase()}
              </button>
            ))}
          </div>
        )}

        {/* Notifications Toast */}
        {shieldToast && (
          <div className="px-3 py-2 rounded-xl bg-zinc-900/95 border border-zinc-700 text-xs font-semibold text-zinc-200 flex items-center justify-between animate-fadeIn shadow-xl">
            <span>{shieldToast}</span>
            <button
              onClick={() => setShieldToast(null)}
              className="text-zinc-400 hover:text-white ml-3 text-[11px] font-bold"
            >
              OK
            </button>
          </div>
        )}
      </div>

      {/* ZONE CENTRALE DU LECTEUR */}
      {(activeLocalSource?.format === 'iframe' || (!activeLocalSource && currentHoster !== 'direct')) && embedUrl ? (
        <div className="w-full h-full pt-28 sm:pt-32 flex items-center justify-center bg-black relative">
          {iframeLoading && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm space-y-3 pointer-events-none">
              <Loader2 className="w-10 h-10 text-red-500 animate-spin" />
              <div className="text-center space-y-1 px-4">
                <p className="text-sm font-bold text-white">
                  Connexion au serveur {currentHosterObj.name} ({selectedLang.toUpperCase()})...
                </p>
                <p className="text-xs text-zinc-400">
                  {currentHosterObj.description}
                </p>
              </div>
            </div>
          )}

          <iframe
            key={`${embedUrl}-sb-${effectiveSandbox}`}
            src={embedUrl}
            title={`${media.title} - ${currentHosterObj.name} (${selectedLang.toUpperCase()})`}
            className="w-full h-full border-0"
            {...(effectiveSandbox
              ? { sandbox: 'allow-scripts allow-same-origin allow-forms allow-presentation' }
              : {})}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
            allowFullScreen
            onLoad={() => setIframeLoading(false)}
          />
        </div>
      ) : (
        /* LECTEUR HTML5 DIRECT + HLS.JS */
        <div 
          className="relative w-full h-full flex items-center justify-center pt-28 sm:pt-32"
          onTouchStart={handleTouchStart}
        >
          {/* Feedback tactile visuel (-10s / +10s / Volume) */}
          {touchFeedback && (
            <div className="absolute z-40 px-4 py-2 rounded-2xl bg-black/75 border border-zinc-700 text-white font-extrabold text-lg flex items-center space-x-2 animate-bounce pointer-events-none">
              <span>{touchFeedback.text}</span>
            </div>
          )}

          {hasError ? (
            <div className="text-center p-8 max-w-md bg-zinc-900/90 border border-zinc-800 rounded-3xl space-y-4">
              <AlertCircle className="w-12 h-12 text-red-500 mx-auto" />
              <h3 className="text-lg font-bold text-white">Flux direct indisponible</h3>
              <p className="text-xs text-zinc-400">
                Basculez sur l'un de nos lecteurs partenaires optimisés (Sibnet, Sendvid, Vidmoly, Filemoon).
              </p>
              <div className="flex justify-center space-x-2 pt-2">
                <button
                  onClick={() => handleHosterSwitch('sibnet')}
                  className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl text-xs"
                >
                  Basculer sur Sibnet
                </button>
              </div>
            </div>
          ) : (
            <div className="relative w-full h-full flex items-center justify-center">
              <video
                key={`direct-video-${selectedLang}-${activeSeason}-${activeEpisodeNum}`}
                ref={videoRef}
                className="w-full h-full object-contain cursor-pointer"
                autoPlay
                playsInline
                x-webkit-airplay="allow"
                crossOrigin="anonymous"
                onLoadedMetadata={restorePosition}
                onTimeUpdate={handleTimeUpdate}
                onEnded={() => setIsPlaying(false)}
                onError={() => setHasError(true)}
                onClick={togglePlay}
              >
                {/* Pistes de sous-titres injectées */}
                {subtitleTracks.map((t) => (
                  <track
                    key={t.id}
                    kind="subtitles"
                    label={t.label}
                    src={t.src}
                    srcLang={t.lang || 'fr'}
                    default={selectedSubId === t.id}
                  />
                ))}
              </video>
            </div>
          )}

          {/* Barre de contrôles HTML5 Direct */}
          {currentHoster === 'direct' && !hasError && (
            <div 
              className={`absolute inset-0 flex flex-col justify-end p-4 sm:p-6 transition-opacity duration-300 pointer-events-none ${
                showControls ? 'opacity-100' : 'opacity-0'
              }`}
            >
              <div className="pointer-events-auto bg-gradient-to-t from-black/95 via-black/70 to-transparent p-4 rounded-2xl space-y-3">
                {/* Slider Timeline */}
                <div className="flex items-center space-x-3">
                  <span className="text-xs font-mono text-zinc-300 w-12 text-right">
                    {formatTime(currentTime)}
                  </span>
                  <input
                    type="range"
                    min="0"
                    max={duration || 100}
                    value={currentTime}
                    onChange={handleSeek}
                    className="flex-1 h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-red-500 hover:h-2 transition-all"
                  />
                  <span className="text-xs font-mono text-zinc-400 w-12">
                    {formatTime(duration)}
                  </span>
                </div>

                {/* Boutons de contrôle */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <button
                      onClick={togglePlay}
                      className="text-white hover:text-red-400 transition-colors p-1"
                    >
                      {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 fill-white" />}
                    </button>

                    <div className="flex items-center space-x-2">
                      <button
                        onClick={toggleMute}
                        className="text-white hover:text-red-400 transition-colors p-1"
                      >
                        {isMuted ? <VolumeX className="w-6 h-6 text-red-500" /> : <Volume2 className="w-6 h-6" />}
                      </button>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={isMuted ? 0 : savedVolume}
                        onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                        className="w-16 sm:w-20 h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-red-500"
                        title="Volume"
                      />
                    </div>

                    <button
                      onClick={() => {
                        if (videoRef.current) videoRef.current.currentTime -= 10;
                        triggerTouchFeedback('rewind', '-10s');
                      }}
                      className="text-zinc-400 hover:text-white transition-colors text-xs flex items-center space-x-1"
                    >
                      <RotateCcw className="w-4 h-4" />
                      <span className="hidden sm:inline">-10s</span>
                    </button>
                  </div>

                  <div className="flex items-center space-x-3">
                    <span className="text-xs text-zinc-400 hidden md:inline">
                      {hlsEngineStatus === 'hlsjs' ? '⚡ HLS.js' : 'Direct HD'} • {selectedLang.toUpperCase()}
                    </span>

                    <button
                      onClick={toggleFullScreen}
                      className="text-white hover:text-red-400 transition-colors p-1"
                      title="Plein écran"
                    >
                      <Maximize className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
