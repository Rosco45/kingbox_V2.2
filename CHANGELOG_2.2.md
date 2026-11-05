# Kingbox 2.2 — Local Edition

## Améliorations
- Ajout de raccourcis clavier dans le lecteur : Espace/K, flèches gauche/droite, M, F et Échap.
- Détection de la prise en charge HLS native du navigateur et avertissement explicite lorsque celle-ci est absente.
- Retrait des fausses pistes WebVTT générées automatiquement : Kingbox ne prétend plus afficher des sous-titres traduits qui ne proviennent pas d'un vrai fichier de sous-titres.
- Documentation mise à jour sur la lecture HLS, les sous-titres, l'accès réseau local et les limites fonctionnelles.
- Version API et application alignées sur 2.2.0.

## Limites connues
- HLS.js n'a pas pu être ajouté : l'installation du paquet a expiré dans l'environnement de préparation. HLS fonctionne uniquement si le navigateur le prend en charge nativement.
- Les sous-titres externes VTT/SRT ne sont pas encore pris en charge.
- La progression des lecteurs iframe tiers ne peut pas être lue à cause des restrictions cross-origin.
- L'API locale n'a pas d'authentification réseau : ne pas l'exposer à Internet.

## Vérifications
- Vérification `node --check` réussie pour le backend et le script de démarrage.
- Tests HTTP réussis : santé API, création de profil, ajout de source et lecture/écriture de progression.
- Le build Vite complet n’a pas pu être exécuté dans l’environnement de préparation : `node_modules` était incomplet et le registre npm a expiré pendant l’installation. Exécuter `npm install` puis `npm run build` sur Ubuntu avant la génération de l’APK.
