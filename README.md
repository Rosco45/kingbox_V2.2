# 👑 KINGBOX 2.2 — Local Edition

Kingbox est une application React/Vite + Capacitor conçue pour fonctionner d'abord sur un PC Ubuntu, être accessible depuis les appareils du même réseau Wi-Fi et être empaquetée en APK Android.

Cette version conserve l'interface et les composants du projet initial et ajoute une couche de services locaux : API locale, base SQLite, profils multiples, sources personnelles, progression de lecture et reprise. La version 2.2 ajoute des raccourcis clavier au lecteur, une détection explicite de la prise en charge HLS native et clarifie les limites des pistes de sous-titres.

> **Important :** Kingbox est un lecteur/catalogue. TMDB, AniList et Jikan fournissent principalement des métadonnées, pas les fichiers des films. N'enregistre et ne lis que des vidéos ou lecteurs que tu possèdes ou que tu es autorisé à diffuser. Les URL personnelles sont stockées dans SQLite ; les vidéos ne sont pas copiées sur le serveur.

## 1. Prérequis (Ubuntu)

- Ubuntu 22.04 ou plus récent.
- Node.js **22.13+** (nécessaire au module SQLite intégré `node:sqlite`). Node 22 LTS ou 24 LTS est conseillé.
- npm (fourni avec Node.js).
- Pour construire l'APK : Android Studio, Android SDK, JDK 21 et les outils Android Platform Tools.
- Pour les fonctionnalités de téléchargement historiques du projet : `curl` et `ffmpeg` installés. N'utilise ces fonctions qu'avec des contenus autorisés.

Vérifier les versions :

```bash
node -v
npm -v
```

## 2. Installation

Extraire l'archive puis ouvrir un terminal dans le dossier `kingbox` :

```bash
cd ~/Téléchargements/kingbox
npm install
```

Aucune base de données externe n'est à installer : SQLite est intégré à Node.js. Le fichier de données sera créé automatiquement dans `server/data/kingbox.sqlite` au premier démarrage.

## 3. Démarrer Kingbox (PC)

Une seule commande démarre l'API locale et Vite :

```bash
npm run dev:local
```

Ouvrir ensuite :

- Application : http://localhost:5173
- Vérification backend : http://localhost:3000/api/health

Pour arrêter les deux services : `Ctrl + C`.

Il est aussi possible de démarrer les services dans deux terminaux :

```bash
# Terminal 1
npm run api

# Terminal 2
npm run dev
```

## 4. Accéder depuis un téléphone sur le même Wi-Fi

1. Connecter le PC et le téléphone au même réseau Wi-Fi.
2. Sur Ubuntu, récupérer l'adresse IP locale :

   ```bash
   hostname -I
   ```

3. Sur le téléphone, ouvrir `http://IP_DU_PC:5173` (exemple : `http://192.168.1.25:5173`).
4. Si Ubuntu bloque les connexions, autoriser temporairement les ports TCP 5173 et 3000 sur le réseau privé. Avec UFW :

   ```bash
   sudo ufw allow 5173/tcp
   sudo ufw allow 3000/tcp
   ```

   Pour annuler : `sudo ufw delete allow 5173/tcp` et `sudo ufw delete allow 3000/tcp`.

Le proxy Vite transmet `/api` vers le backend local sur le port 3000.

## 5. Profils, sources personnelles et reprise de lecture

Cliquer sur l'icône de profils en haut de l'application puis :

- Créer plusieurs profils et passer de l'un à l'autre.
- Enregistrer des sources personnelles MP4, HLS ou iframe.
- Associer une source à une fiche en renseignant son ID de média (facultatif).
- Supprimer une source ou un profil.
- Les favoris et la progression de lecture sont conservés par profil dans SQLite.
- La page d'accueil affiche « Reprendre la lecture » pour les contenus déjà commencés.
- Les épisodes de séries sont suivis séparément (saison/épisode).
- Le lecteur sauvegarde la position environ toutes les 10 secondes et à sa fermeture pour les flux vidéo HTML5. Raccourcis clavier : Espace/K (lecture/pause), ←/→ (recul/avance de 10 secondes), M (muet), F (plein écran), Échap (fermer).

Dans la fiche d'un média, les sources associées sont affichées sous « Mes sources personnelles ». Le lecteur charge les sources associées au profil et permet de passer de l'une à l'autre. Les sources iframe ouvrent un lecteur intégré ; les sources MP4/HLS sont envoyées au lecteur HTML5. La prise en charge HLS dépend du navigateur : Kingbox utilise la prise en charge native lorsqu’elle existe (notamment Safari/iOS). Les navigateurs Chromium/Android et certaines WebView ne lisent pas toujours les fichiers `.m3u8` ; HLS.js n’est pas inclus dans cette archive. Une alerte est affichée lorsque le navigateur ne déclare pas de prise en charge native. Préfère une source MP4 si le flux HLS ne démarre pas. Les pistes de sous-titres externes ne sont pas encore intégrées : le menu ne simule plus de faux sous-titres.

Les sources enregistrées sont accessibles au backend local. Elles ne sont pas transférées automatiquement entre plusieurs installations du navigateur ou de l'APK : le téléphone doit pouvoir joindre le serveur du PC.

## 6. Utiliser l'APK Android

### Préparer Android

- Installer Android Studio et les SDK nécessaires.
- Ouvrir le dossier `android/` dans Android Studio une première fois pour laisser Gradle synchroniser le projet.
- Vérifier que le JDK 21 est sélectionné dans Android Studio.

### Générer l'APK debug

Depuis la racine du projet :

```bash
npm run build:apk
```

L'APK est généré sous `Kingbox.apk`.

Alternative :

```bash
npm run build
npx cap sync android
npx cap open android
```

Puis dans Android Studio : **Build > Build Bundle(s) / APK(s) > Build APK(s)**.

### Connecter l'APK au backend de ton PC

1. Démarrer `npm run dev:local` sur le PC.
2. Dans l'APK, ouvrir **Profils & sources > Serveur**.
3. Entrer l'adresse du PC, par exemple `http://192.168.1.25:3000` (sans `/api`).
4. Enregistrer puis relancer l'application.

L'APK peut afficher son interface embarquée sans le PC, mais les profils, favoris SQLite et sources qui résident sur le PC nécessitent que le serveur soit démarré et joignable. Les catalogues publics nécessitent Internet.

## 7. API locale disponible

- `GET /api/health` — état du serveur.
- `GET /api/profiles` — liste des profils.
- `POST /api/profiles` — créer un profil (`{ "name": "Invité" }`).
- `PATCH /api/profiles/:id` — modifier un profil.
- `DELETE /api/profiles/:id` — supprimer un profil (le dernier profil est protégé).
- `GET /api/profiles/:id/favorites` — lire les favoris.
- `POST /api/profiles/:id/favorites` — ajouter un favori (`{ "media": { ... } }`).
- `DELETE /api/profiles/:id/favorites?mediaId=...` — retirer un favori.
- `GET /api/profiles/:id/sources` — lister les sources.
- `POST /api/profiles/:id/sources` — ajouter une source.
- `DELETE /api/sources/:id` — supprimer une source.
- `GET/POST /api/profiles/:id/progress` — lire/enregistrer la progression de lecture.

## 8. Sauvegarder / restaurer la base SQLite

Arrêter le serveur puis copier le fichier :

```bash
cp server/data/kingbox.sqlite ~/kingbox-backup.sqlite
```

Pour restaurer, arrêter le serveur et replacer le fichier dans `server/data/kingbox.sqlite`.

## 9. API de catalogue

- TMDB : clé API à obtenir sur https://www.themoviedb.org/settings/api. Respecter les conditions d'utilisation et d'attribution TMDB.
- AniList : API GraphQL publique, documentation https://docs.anilist.co/.
- Jikan : API publique non officielle de MyAnimeList, documentation https://docs.jikan.moe/.

Ces services ne donnent pas automatiquement le droit de diffuser les vidéos. Les informations adultes doivent être filtrées et protégées de manière adaptée ; une simple fenêtre PIN côté navigateur n'est pas une vérification d'âge robuste.

## 10. Dépannage

**Le téléphone ne charge pas le site :** vérifier que les deux appareils sont sur le même Wi-Fi, utiliser l'adresse IP du PC et vérifier le pare-feu.

**L'application affiche « backend indisponible » :** vérifier `http://localhost:3000/api/health` sur le PC, puis vérifier l'adresse du serveur dans l'APK.

**`node:sqlite` est introuvable :** mettre Node.js à niveau vers Node 22.13+ ou 24 LTS.

**L'APK ne se construit pas :** ouvrir `android/` dans Android Studio, installer les SDK demandés et vérifier le JDK 21.

**La source HLS ne démarre pas :** vérifier que l'URL `.m3u8` est accessible et que le serveur distant autorise le CORS ; certains navigateurs ne lisent pas HLS nativement.

## Notes de sécurité

- Cette version est destinée à un usage local privé. Ne redirige pas les ports 3000 ou 5173 de ton routeur vers Internet.
- L'API locale est volontairement simple et ne constitue pas encore un service multi-utilisateur exposé à Internet : il n'y a pas d'authentification réseau. Garde-la sur un réseau de confiance.
- L'autorisation de contenu 18+ ne repose pas uniquement sur le verrou PIN existant. Ne rends pas ce catalogue accessible à des mineurs.
- Les sources personnelles doivent être des contenus dont tu détiens les droits ou dont l'intégration est explicitement autorisée.


## 11. État des fonctions dans la version 2.2

- **Opérationnel côté local :** API Node, SQLite, profils, favoris, sources manuelles, suivi et reprise de progression pour les vidéos HTML5, accès navigateur sur le réseau local.
- **Selon le navigateur :** lecture HLS native. La compatibilité dépend du moteur Web et des règles CORS de l'hébergeur.
- **Non inclus dans cette version :** moteur HLS.js embarqué, synchronisation de progression des lecteurs iframe externes, chargement de fichiers de sous-titres externes, authentification réseau.
- **Android :** l'APK doit être construit sur la machine Ubuntu avec Android Studio/SDK et JDK compatibles. L'archive source ne contient pas d'APK précompilé.

Les fonctions héritées de résolution de catalogues/hébergeurs dépendent de services tiers qui peuvent changer ou devenir indisponibles. Le mode recommandé et pérenne reste l'ajout de sources directes dont tu as l'autorisation d'usage.
