# qBittorrent Cleaner

Outil léger en Node.js/TypeScript pour supprimer en sécurité des torrents anciens depuis l'API Web de qBittorrent, selon des règles de rétention configurables.

## Fonctionnalités

- Authentification via l'API Web qBittorrent
- Analyse des torrents avec règles cumulatives
- Mode `dry-run` activé par défaut
- Limite stricte de suppressions par exécution
- Protections par tags, catégories et chemins
- Exécution ponctuelle ou planifiée via `node-cron`
- Support Docker
- Logs structurés avec `pino`

## Règles de suppression

Un torrent devient éligible seulement si toutes les conditions configurées sont remplies :

- ratio `>= MIN_RATIO`
- inactif depuis `INACTIVE_DAYS`
- âge minimal `>= MIN_TORRENT_AGE_DAYS`
- torrent terminé si `ONLY_COMPLETED=true`
- non protégé par tag, catégorie ou chemin

## Démarrage local

```bash
npm install
cp .env.example .env
npm run dev
```

Pour un lancement unique :

```bash
npm run build
node dist/index.js --run-once
```

## Variables d'environnement

Voir [.env.example](./.env.example) pour la configuration complète.

Les variables de sécurité importantes :

- `DRY_RUN=true`
- `INTERACTIVE=false`
- `MAX_DELETE_PER_RUN=5`
- `EXCLUDED_TAG=keep`
- `PROTECTED_CATEGORIES=archive,linux-isos`
- `PROTECTED_SAVE_PATHS=/data/permanent,/data/archive`

## Docker

```bash
docker compose up --build
```

Le conteneur utilise la planification interne par défaut. Pour une exécution unique, surchargez la commande :

```bash
docker run --env-file .env qbittorrent-cleaner node dist/index.js --run-once
```

## Scripts

- `npm run dev` : exécution locale simple
- `npm run dev:watch` : développement avec rechargement
- `npm run build` : compilation TypeScript
- `npm run start` : exécution depuis `dist`
- `npm run lint` : vérification ESLint
- `npm run test` : tests unitaires
- `npm run format` : formatage Prettier

## Execution locale sans cron

Si `USE_CRON=false`, `npm run dev` lance immédiatement une analyse puis s'arrête, sans démarrer le scheduler interne.

Si `USE_CRON=true`, l'application démarre le scheduler `node-cron` puis exécute aussi un premier passage au démarrage.

Si `INTERACTIVE=true`, l'application commence toujours par un `dry-run`, puis demande une confirmation globale `Y/n` avant toute suppression réelle. La valeur par défaut est `N`, donc une entrée vide annule la suppression.

## Tests couverts

- logique d'éligibilité
- fallback sur la date de complétion
- protections tag/catégorie/chemin
- limite `MAX_DELETE_PER_RUN`
- comportement `DRY_RUN`

## Structure

```txt
src/
  api/
  cleaner/
  config/
  models/
  utils/
tests/
```
