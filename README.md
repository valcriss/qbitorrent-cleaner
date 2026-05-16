# qBittorrent Cleaner

Safe, automation-first torrent cleanup for qBittorrent.

`qBittorrent Cleaner` connects to the official qBittorrent Web API, evaluates torrents against configurable retention rules, and removes only the torrents that match every condition you define. The project is built to be conservative by default: `dry-run` is enabled out of the box, deletion limits are enforced, and protected tags, categories, and save paths are respected before anything can be removed.

## Highlights

- Safe by default with `DRY_RUN=true`
- Interactive approval mode before real deletion
- Scheduled execution with `node-cron`
- Immediate one-shot execution for local testing
- Protection rules for tags, categories, and save paths
- Structured logging with `pino`
- Docker-ready
- TypeScript, ESLint, Prettier, and Vitest included

## How It Works

A torrent becomes eligible for deletion only if all configured conditions are met:

- `ratio >= MIN_RATIO`
- inactive for at least `INACTIVE_DAYS`
- older than `MIN_TORRENT_AGE_DAYS`
- completed, when `ONLY_COMPLETED=true`
- not protected by tag, category, or save path

The cleaner then applies an additional hard safety cap:

- no more than `MAX_DELETE_PER_RUN` torrents can be deleted in a single run

## Safety Model

This project is intentionally conservative.

- `DRY_RUN=true` means no deletion happens, only analysis and logs
- `INTERACTIVE=true` forces a dry-run first, then asks for one global confirmation
- empty input cancels deletion in interactive mode
- only explicit `Y` or `yes` confirms deletion
- if an interactive console is not available, the run stays safe and skips real deletion

## Requirements

- Node.js `20+`
- A reachable qBittorrent instance with Web UI enabled
- Valid qBittorrent Web API credentials

## Quick Start

1. Install dependencies:

```bash
npm install
```

2. Create your environment file:

```bash
cp .env.example .env
```

3. Edit `.env` with your qBittorrent URL and credentials.

4. Run a local analysis:

```bash
npm run dev
```

With the default configuration, this performs a safe dry-run.

## Common Run Modes

Local one-off analysis:

```bash
npm run dev
```

Watch mode during development:

```bash
npm run dev:watch
```

Run the compiled app once:

```bash
npm run build
node dist/src/index.js --run-once
```

Run the compiled app with the `start` script:

```bash
npm run build
npm run start
```

## Interactive Mode

Set the following values in `.env`:

```env
INTERACTIVE=true
DRY_RUN=false
USE_CRON=false
```

Then run:

```bash
npm run dev
```

The cleaner will:

1. perform a dry-run analysis
2. show matching deletion candidates in the logs
3. ask for a single confirmation prompt
4. perform the real deletion only if you answer `Y` or `yes`

Prompt behavior:

- `Y` or `yes`: proceed with deletion
- `n`, empty input, or anything else: cancel deletion

## Scheduling

If `USE_CRON=true`, the application starts the internal scheduler using `CRON_SCHEDULE`.

Example:

```env
USE_CRON=true
CRON_SCHEDULE=0 3 * * *
```

If `USE_CRON=false`, the app runs immediately and exits without starting the scheduler.

## Environment Variables

The full reference lives in [.env.example](C:/Users/silve/Documents/GitHub/qbitorrent-cleaner/.env.example).

Core connection settings:

- `QBITTORRENT_BASE_URL`
- `QBITTORRENT_USERNAME`
- `QBITTORRENT_PASSWORD`
- `REQUEST_TIMEOUT_MS`

Cleanup rules:

- `MIN_RATIO`
- `INACTIVE_DAYS`
- `MIN_TORRENT_AGE_DAYS`
- `ONLY_COMPLETED`

Safety controls:

- `DRY_RUN`
- `INTERACTIVE`
- `MAX_DELETE_PER_RUN`
- `DELETE_FILES`
- `EXCLUDED_TAG`
- `PROTECTED_CATEGORIES`
- `PROTECTED_SAVE_PATHS`

Execution settings:

- `USE_CRON`
- `CRON_SCHEDULE`
- `LOG_LEVEL`

## Docker

Build and run with Docker Compose:

```bash
docker compose up --build
```

The service uses your `.env` file and starts the compiled application from `dist/src/index.js`.

Run a one-shot container command:

```bash
docker run --env-file .env qbittorrent-cleaner node dist/src/index.js --run-once
```

## Scripts

- `npm run dev` runs the app once from source
- `npm run dev:watch` runs the app in watch mode
- `npm run build` compiles TypeScript to `dist/`
- `npm run start` starts the compiled app
- `npm run lint` runs ESLint
- `npm run test` runs the unit tests
- `npm run test:watch` runs tests in watch mode
- `npm run format` formats the repository with Prettier

## Testing

The test suite currently covers:

- eligibility evaluation
- inactivity fallback logic
- protected tags, categories, and save paths
- deletion limit enforcement
- dry-run behavior
- environment boolean parsing
- interactive confirmation parsing

Run the suite with:

```bash
npm run test
```

## Project Structure

```txt
src/
  api/
  cleaner/
  config/
  models/
  utils/
tests/
```

## Notes

- The qBittorrent Web API relies on a session cookie after authentication. This project handles that session flow internally.
- On Windows or in some IDE terminals, interactive confirmation may need the console fallback implemented in the app. If no interactive console is available, deletion is cancelled automatically.
- This project is designed to prefer safety over aggressiveness.
