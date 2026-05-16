# agents.md — qBittorrent Cleaner Agent

## Project Overview

This project is a lightweight automation tool designed to clean old torrents from a qBittorrent instance based on configurable retention rules.

The goal is to automatically free disk space while keeping enough seeding time and ratio to remain fair on trackers.

The tool must:

- Connect to qBittorrent through the official Web API
- Analyze torrents
- Apply configurable cleanup rules
- Delete torrents and optionally their files
- Produce detailed logs
- Be safe by default

The project must be designed to run:

- locally,
- inside Docker,
- or via cron / scheduled execution.

---

# Core Features

## 1. qBittorrent API Integration

The application must authenticate against qBittorrent Web API.

Supported actions:

- authenticate
- retrieve torrents
- delete torrents
- delete associated files
- retrieve categories/tags/save paths

The implementation must tolerate:

- temporary API failure,
- invalid session expiration,
- unavailable qBittorrent instance.

---

# Cleanup Rules

A torrent becomes eligible for deletion when ALL configured conditions are met.

## Required Rules

### Ratio

Example:

```env
MIN_RATIO=2
```

Torrent ratio must be >= configured ratio.

---

### Inactivity Duration

Example:

```env
INACTIVE_DAYS=14
```

Torrent last activity must be older than X days.

Use:

- last activity,
- or completion timestamp fallback.

---

### Completed Torrents Only

```env
ONLY_COMPLETED=true
```

Only completed torrents may be deleted.

---

### Minimum Torrent Age

```env
MIN_TORRENT_AGE_DAYS=7
```

Protect freshly downloaded torrents.

---

# Safety Features

Safety is CRITICAL.

The tool MUST NEVER aggressively delete torrents without protections.

---

## Dry Run Mode

```env
DRY_RUN=true
```

When enabled:

- no deletion occurs,
- only logs are generated.

This mode should be enabled by default.

---

## Maximum Deletions Per Run

```env
MAX_DELETE_PER_RUN=5
```

The cleaner must stop after reaching this limit.

This avoids catastrophic deletions caused by:

- bad configuration,
- API bugs,
- logic bugs.

---

## Protected Tags

```env
EXCLUDED_TAG=keep
```

Any torrent containing this tag must NEVER be deleted.

---

## Protected Categories

```env
PROTECTED_CATEGORIES=archive,linux-isos
```

Protected categories are excluded from cleanup.

---

## Protected Save Paths

```env
PROTECTED_SAVE_PATHS=/data/permanent,/data/archive
```

Any torrent located in these directories is protected.

---

# Optional Features

## Free Space Target

Optional future feature:

```env
MIN_FREE_SPACE_GB=100
```

The cleaner deletes torrents until:

- free disk space reaches the target,
- or MAX_DELETE_PER_RUN is reached.

---

## Notification System

Optional future integrations:

- Discord webhook
- Slack webhook
- Email
- MQTT

Notifications may include:

- deleted torrents,
- recovered disk space,
- errors,
- dry-run reports.

---

# Logging

The application must provide structured logs.

Example:

```txt
[Cleaner]
Scanned: 312 torrents
Matched: 18 torrents
Deleted: 5 torrents
Recovered: 128 GB
DryRun: false
```

Deletion logs must include:

- torrent name,
- ratio,
- inactivity duration,
- size,
- save path.

---

# Recommended Stack

## Backend

- Node.js
- TypeScript

---

## HTTP Client

Preferred:

- axios

Alternative:

- native fetch

---

## Configuration

Use:

- dotenv

---

## Logging

Use:

- pino

or:

- winston

---

# Recommended Project Structure

```txt
qbittorrent-cleaner/
├── src/
│   ├── api/
│   │   └── qbittorrentClient.ts
│   │
│   ├── cleaner/
│   │   ├── eligibility.ts
│   │   ├── cleaner.ts
│   │   └── deletion.ts
│   │
│   ├── config/
│   │   └── config.ts
│   │
│   ├── models/
│   │   └── torrent.ts
│   │
│   ├── utils/
│   │   ├── dates.ts
│   │   ├── bytes.ts
│   │   └── logger.ts
│   │
│   └── index.ts
│
├── tests/
│
├── .env
├── .env.example
├── Dockerfile
├── docker-compose.yml
├── package.json
└── README.md
```

---

# Docker Support

The project MUST support Docker execution.

Example expectations:

```yaml
services:
  cleaner:
    build: .
    restart: unless-stopped
    env_file:
      - .env
```

---

# Scheduling

The cleaner may run:

- continuously,
- or periodically.

Preferred approach:

- internal scheduler using node-cron

Example:

```env
CRON_SCHEDULE=0 3 * * *
```

Default:

- once per night.

---

# Expected Development Quality

The codebase must include:

- strict TypeScript typing,
- ESLint,
- Prettier,
- unit tests,
- separation of concerns,
- environment validation.

---

# Testing Requirements

The project must include tests for:

- eligibility logic,
- inactivity calculations,
- protection rules,
- deletion limits,
- dry-run behavior.

Edge cases are important.

---

# Recommended Future Evolutions

Potential future features:

- Web UI dashboard
- Prometheus metrics
- Multi-instance qBittorrent support
- Torrent archiving before deletion
- Interactive approval mode
- Smart scoring system
- Tracker-specific rules
- Per-category retention policies

---

# Smart Scoring Idea (Future)

Instead of simple thresholds, torrents could receive a score.

Example:

- old torrent → +points
- high ratio → +points
- low activity → +points
- large size → +points

Deletion starts from highest scores.

This enables smarter cleanup decisions.

---

# Important Constraints

The tool MUST NEVER:

- delete active downloads,
- delete incomplete torrents,
- ignore safety protections,
- exceed MAX_DELETE_PER_RUN,
- bypass DRY_RUN behavior.

Safety has priority over aggressiveness.

---

# Expected Deliverables

Codex should generate:

- complete Node.js TypeScript project
- Docker support
- README
- .env.example
- unit tests
- production-ready structure

The generated project should be immediately runnable.

