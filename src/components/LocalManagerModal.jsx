import React, { useEffect, useState } from 'react';
import { X, UserRound, Plus, Trash2, Link2, Film, Tv, ShieldCheck, RefreshCw, Server, CheckCircle2 } from 'lucide-react';
import { apiRequest, getApiBase } from '../services/localApi';

const inputClass = 'w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm text-white outline-none focus:border-red-500';

export default function LocalManagerModal({ isOpen, onClose, activeProfileId, onProfileChange }) {
  const [tab, setTab] = useState('profiles');
  const [profiles, setProfiles] = useState([]);
  const [sources, setSources] = useState([]);
  const [name, setName] = useState('');
  const [serverUrl, setServerUrl] = useState(localStorage.getItem('kingbox_server_url') || '');
  const [source, setSource] = useState({ title: '', mediaId: '', url: '', format: 'mp4', kind: 'movie', language: 'und', quality: 'Auto', isAdult: false, notes: '' });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const data = await apiRequest('/profiles');
      setProfiles(data.profiles || []);
      if (activeProfileId) {
        const sourceData = await apiRequest(`/profiles/${encodeURIComponent(activeProfileId)}/sources`);
        setSources(sourceData.sources || []);
      }
      setError('');
    } catch (err) { setError(`${err.message}. Vérifie que le serveur Kingbox est démarré.`); }
  };
  useEffect(() => { if (isOpen) load(); }, [isOpen, activeProfileId]);
  if (!isOpen) return null;

  const createProfile = async (e) => {
    e.preventDefault(); if (!name.trim()) return;
    setBusy(true); setError('');
    try {
      const data = await apiRequest('/profiles', { method: 'POST', body: JSON.stringify({ name: name.trim() }) });
      setProfiles(prev => [...prev, data.profile]); setName(''); setMessage('Profil créé.');
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  const removeProfile = async (id) => {
    if (!window.confirm('Supprimer ce profil et ses données locales ?')) return;
    try {
      await apiRequest(`/profiles/${encodeURIComponent(id)}`, { method: 'DELETE' });
      const data = await apiRequest('/profiles'); setProfiles(data.profiles || []);
      if (id === activeProfileId && data.profiles?.[0]) onProfileChange(data.profiles[0]);
    } catch (err) { setError(err.message); }
  };
  const saveServer = () => {
    const clean = serverUrl.trim().replace(/\/$/, '');
    if (clean && !/^https?:\/\//i.test(clean)) return setError('Adresse du serveur invalide (http:// ou https:// requis).');
    localStorage.setItem('kingbox_server_url', clean);
    setMessage('Adresse du serveur enregistrée. Recharge l’application pour appliquer le changement.');
  };
  const addSource = async (e) => {
    e.preventDefault(); setBusy(true); setError('');
    try {
      const data = await apiRequest(`/profiles/${encodeURIComponent(activeProfileId)}/sources`, { method: 'POST', body: JSON.stringify(source) });
      setSources(prev => [data.source, ...prev]);
      setSource({ title: '', mediaId: '', url: '', format: 'mp4', kind: 'movie', language: 'und', quality: 'Auto', isAdult: false, notes: '' });
      setMessage('Source enregistrée dans SQLite.');
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  const deleteSource = async (id) => {
    try { await apiRequest(`/sources/${encodeURIComponent(id)}`, { method: 'DELETE' }); setSources(prev => prev.filter(s => s.id !== id)); }
    catch (err) { setError(err.message); }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-3 backdrop-blur-md">
      <div className="relative max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-zinc-800 bg-[#111118] p-5 shadow-2xl sm:p-6">
        <button onClick={onClose} className="absolute right-4 top-4 rounded-full bg-zinc-800 p-2 text-zinc-300 hover:text-white"><X className="h-5 w-5" /></button>
        <div className="mb-5 flex items-center gap-3">
          <div className="rounded-xl bg-red-600/15 p-3 text-red-400"><Server className="h-6 w-6" /></div>
          <div><h2 className="text-xl font-extrabold text-white">Gestion locale Kingbox</h2><p className="text-xs text-zinc-400">Profils, sources personnelles et serveur local</p></div>
        </div>
        <div className="mb-5 flex gap-2 border-b border-zinc-800 pb-3">
          {[['profiles','Profils'],['sources','Mes sources'],['server','Serveur']].map(([id,label]) => <button key={id} onClick={() => setTab(id)} className={`rounded-full px-4 py-2 text-xs font-bold ${tab===id?'bg-red-600 text-white':'bg-zinc-900 text-zinc-400 hover:text-white'}`}>{label}</button>)}
        </div>
        {message && <div className="mb-3 flex items-center gap-2 rounded-xl border border-green-500/20 bg-green-500/10 p-3 text-xs text-green-300"><CheckCircle2 className="h-4 w-4"/>{message}</div>}
        {error && <div className="mb-3 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-300">{error}</div>}
        {tab === 'profiles' && <div className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-2">{profiles.map(profile => <div key={profile.id} className={`flex items-center justify-between rounded-2xl border p-3 ${profile.id===activeProfileId?'border-red-500/60 bg-red-500/10':'border-zinc-800 bg-zinc-900/60'}`}><button onClick={() => { onProfileChange(profile); onClose(); }} className="flex min-w-0 items-center gap-3 text-left"><span className="text-2xl">{profile.avatar}</span><span className="min-w-0"><strong className="block truncate text-sm text-white">{profile.name}</strong><small className="text-zinc-500">{profile.id===activeProfileId?'Profil actif':'Changer de profil'}</small></span></button><button onClick={() => removeProfile(profile.id)} title="Supprimer" className="rounded-lg p-2 text-zinc-500 hover:bg-red-500/10 hover:text-red-400"><Trash2 className="h-4 w-4"/></button></div>)}</div>
          <form onSubmit={createProfile} className="flex gap-2"><input className={inputClass} value={name} onChange={e=>setName(e.target.value)} maxLength={32} placeholder="Nom du nouveau profil"/><button disabled={busy} className="flex shrink-0 items-center gap-1 rounded-xl bg-red-600 px-4 text-sm font-bold text-white disabled:opacity-50"><Plus className="h-4 w-4"/>Créer</button></form>
          <p className="text-[11px] leading-relaxed text-zinc-500">Chaque profil dispose de son propre espace de favoris, d’historique et de sources enregistrées. Les données restent sur ton PC.</p>
        </div>}
        {tab === 'sources' && <div className="space-y-4">
          <form onSubmit={addSource} className="grid gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4 sm:grid-cols-2">
            <input className={`${inputClass} sm:col-span-2`} required value={source.title} onChange={e=>setSource({...source,title:e.target.value})} placeholder="Titre du film / épisode"/>
            <input className={`${inputClass} sm:col-span-2`} required type="url" value={source.url} onChange={e=>setSource({...source,url:e.target.value})} placeholder="URL autorisée MP4 / HLS / iframe"/>
            <select className={inputClass} value={source.format} onChange={e=>setSource({...source,format:e.target.value})}><option value="mp4">MP4 direct</option><option value="hls">HLS (.m3u8)</option><option value="iframe">Lecteur intégré (iframe)</option></select>
            <select className={inputClass} value={source.kind} onChange={e=>setSource({...source,kind:e.target.value})}><option value="movie">Film</option><option value="episode">Épisode</option><option value="adult">Contenu adulte</option><option value="other">Autre</option></select>
            <input className={inputClass} value={source.language} onChange={e=>setSource({...source,language:e.target.value})} placeholder="Langue (fr, en, ja…)"/>
            <input className={inputClass} value={source.quality} onChange={e=>setSource({...source,quality:e.target.value})} placeholder="Qualité (1080p, 720p…)"/>
            <label className="flex items-center gap-2 text-xs text-zinc-300 sm:col-span-2"><input type="checkbox" checked={source.isAdult} onChange={e=>setSource({...source,isAdult:e.target.checked})}/> Marquer comme contenu 18+</label>
            <button disabled={busy} className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50 sm:col-span-2">Enregistrer la source</button>
          </form>
          <div className="space-y-2">{sources.map(item => <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-3"><div className="min-w-0"><strong className="block truncate text-sm text-white">{item.title}</strong><span className="text-[11px] text-zinc-500">{item.format.toUpperCase()} · {item.quality} · {item.isAdult?'18+':'Tout public'}</span></div><button onClick={()=>deleteSource(item.id)} className="rounded-lg p-2 text-zinc-500 hover:text-red-400"><Trash2 className="h-4 w-4"/></button></div>)}{sources.length===0&&<p className="py-5 text-center text-xs text-zinc-500">Aucune source personnelle enregistrée.</p>}</div>
          <p className="text-[11px] leading-relaxed text-zinc-500">Ajoute uniquement des URL de vidéos ou lecteurs que tu possèdes ou que tu es autorisé à diffuser. Les liens sont enregistrés, ils ne sont pas hébergés par Kingbox.</p>
        </div>}
        {tab === 'server' && <div className="space-y-4">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4"><p className="mb-1 text-xs font-bold uppercase tracking-wide text-zinc-300">API locale actuelle</p><code className="break-all text-xs text-green-300">{getApiBase()}</code><p className="mt-2 text-[11px] text-zinc-500">Dans le navigateur du PC, le proxy Vite utilise automatiquement le backend local. Pour l’APK sur le Wi-Fi, indique l’adresse IP du PC, par exemple http://192.168.1.10:3000.</p></div>
          <label className="block space-y-1.5"><span className="text-xs font-semibold text-zinc-300">Adresse du serveur pour l’APK / un autre réseau</span><input className={inputClass} value={serverUrl} onChange={e=>setServerUrl(e.target.value)} placeholder="http://192.168.1.10:3000"/></label>
          <button onClick={saveServer} className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white">Enregistrer l’adresse</button>
          <p className="text-[11px] leading-relaxed text-amber-300/80">L’accès distant n’est pas activé automatiquement. Ne redirige pas le port 3000 sur Internet. Pour un accès depuis l’extérieur, utilise plus tard un VPN privé.</p>
        </div>}
      </div>
    </div>
  );
}
