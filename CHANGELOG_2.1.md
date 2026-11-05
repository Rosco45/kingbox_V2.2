# Kingbox 2.1 — changements

- Connexion de la progression de lecture à l'API SQLite locale.
- Enregistrement automatique de la position environ toutes les 10 secondes pour les flux HTML5.
- Sauvegarde de la position à la fermeture du lecteur.
- Clé de progression indépendante par épisode (saison/épisode).
- Nouvelle rangée « Reprendre la lecture » sur l'accueil.
- Barre de progression visuelle sur les cartes reprises.
- Chargement des sources personnelles du profil actif dans le lecteur.
- Sélection de la source personnelle choisie depuis la fiche du média.

## Limites connues

- Les lecteurs iframe externes ne permettent pas de lire leur position depuis Kingbox, pour des raisons de sécurité du navigateur.
- La prise en charge HLS dépend du navigateur. HLS.js n'est pas encore intégré ; certains navigateurs Chromium/Android ne liront pas directement les flux `.m3u8`.
- La progression est conservée sur le serveur local SQLite. L'APK doit être configuré pour joindre ce serveur afin de synchroniser les données.
- Le backend reste destiné à un réseau local privé et ne dispose pas encore d'authentification réseau.
