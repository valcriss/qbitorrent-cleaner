# Cleanup Audit

Ce repertoire contient un outil autonome pour auditer qBittorrent et supprimer
les fichiers orphelins sur le serveur hote.

## Ce que fait le script

- se connecte a l'API Web de qBittorrent
- recupere les torrents encore connus du client
- convertit les `savePath` du conteneur Docker vers les chemins reels de l'hote
- scanne les chemins sur le serveur
- produit un rapport JSON des entrees presentes sur disque mais absentes du client
- peut supprimer les orphelins quand `DRY_RUN=false`

Par defaut, le script ne supprime rien.

## Preparer la configuration

1. Copier `.env.example` vers `.env`
2. Renseigner les acces qBittorrent
3. Definir `PATH_MAPPINGS`

Exemple:

```env
QBITTORRENT_BASE_URL=http://127.0.0.1:8080
QBITTORRENT_USERNAME=admin
QBITTORRENT_PASSWORD=adminadmin
PATH_MAPPINGS=/downloads:/srv/media/downloads,/watch:/srv/media/watch
SCAN_ROOTS=/srv/media/downloads
AUDIT_MODE=file
DRY_RUN=true
OUTPUT_FILE=./orphan-report.json
```

## Modes d'audit

### `AUDIT_MODE=folder`

Compare les racines de contenu attendues avec les entrees directes presentes
dans les dossiers parents. C'est le mode le plus simple pour retrouver des
dossiers torrent restes sur disque.

### `AUDIT_MODE=file`

Interroge aussi la liste des fichiers de chaque torrent aupres de qBittorrent,
puis compare les fichiers exacts presents sur disque. C'est le mode le plus
precis pour verifier qu'aucun torrent actif ne pointe vers des fichiers manquants.

## Lancer l'audit

Depuis le dossier `cleanup/` copie sur le serveur:

```bash
node audit-orphans.js
```

Ou avec un autre fichier d'environnement:

```bash
node audit-orphans.js --env /etc/qb-cleanup.env
```

## Supprimer reellement les orphelins

Le script est safe par defaut.

1. Faire une premiere execution avec:

```env
DRY_RUN=true
```

2. Verifier le rapport JSON
3. Passer ensuite a:

```env
DRY_RUN=false
```

4. Relancer:

```bash
node audit-orphans.js
```

## Garde-fous

Le script bloque la suppression si l'audit detecte au moins un de ces cas:

- `unmappedTorrents > 0`
- `missingExpectedEntries > 0`
- `scanErrors > 0`

Dans ce cas, le rapport est ecrit, mais aucune suppression n'est effectuee.

## Rapport produit

Le fichier JSON contient notamment:

- `summary`: compteurs principaux
- `pathMappings`: mappings conteneur -> hote utilises
- `expectedEntries`: contenus encore references par qBittorrent
- `orphanCandidates`: contenus probablement orphelins
- `unmappedTorrents`: torrents dont le `savePath` n'a pas pu etre converti
- `missingExpectedEntries`: contenus attendus mais absents du disque
- `deletion`: resultat d'une suppression reelle si `DRY_RUN=false`

## Conseils d'usage

- commencer par `AUDIT_MODE=file` si tu veux valider l'integrite des torrents actifs
- laisser `DRY_RUN=true` pour la premiere execution
- ne passer a `DRY_RUN=false` qu'une fois le rapport juge coherent
- viser d'abord les zones les plus volumineuses comme `stale`
