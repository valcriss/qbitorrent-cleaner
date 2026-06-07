#!/usr/bin/env node

const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');

const BOOLEAN_TRUE_VALUES = new Set(['true', '1', 'yes', 'on']);
const BOOLEAN_FALSE_VALUES = new Set(['false', '0', 'no', 'off']);
const SCRIPT_DIR = __dirname;

const printHelp = () => {
  console.log(`Usage: node audit-orphans.js [--env <path>] [--help]

Audits qBittorrent content against the host filesystem and writes a JSON report.
By default it loads .env next to the script.
`);
};

const parseBoolean = (value, defaultValue) => {
  if (value === undefined) {
    return defaultValue;
  }

  const normalized = String(value).trim().toLowerCase();
  if (BOOLEAN_TRUE_VALUES.has(normalized)) {
    return true;
  }

  if (BOOLEAN_FALSE_VALUES.has(normalized)) {
    return false;
  }

  throw new Error(`Invalid boolean value: ${value}`);
};

const splitCsv = (value) =>
  String(value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

const resolvePathFromScriptDir = (inputPath) => {
  if (path.isAbsolute(inputPath)) {
    return path.normalize(inputPath);
  }

  return path.resolve(SCRIPT_DIR, inputPath);
};

const parseArgs = (argv) => {
  let envPath = path.resolve(SCRIPT_DIR, '.env');

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }

    if (arg === '--env') {
      const nextArg = argv[index + 1];
      if (!nextArg) {
        throw new Error('Missing value after --env');
      }

      envPath = path.resolve(process.cwd(), nextArg);
      index += 1;
    }
  }

  return { envPath };
};

const parseEnvFile = (envPath) => {
  let fileContent;

  try {
    fileContent = fsSync.readFileSync(envPath, 'utf8');
  } catch (error) {
    throw new Error(`Unable to load environment file at ${envPath}: ${error.message}`);
  }

  const parsed = {};

  for (const rawLine of fileContent.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const separatorIndex = line.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    parsed[key] = value;
  }

  return parsed;
};

const loadConfig = (envPath) => {
  const env = parseEnvFile(envPath);

  const auditMode = env.AUDIT_MODE?.trim().toLowerCase() || 'folder';
  if (!['folder', 'file'].includes(auditMode)) {
    throw new Error(`Invalid AUDIT_MODE: ${env.AUDIT_MODE}`);
  }

  const requestTimeoutMs = Number(env.REQUEST_TIMEOUT_MS || '10000');
  const minOrphanAgeDays = Number(env.MIN_ORPHAN_AGE_DAYS || '7');

  if (!Number.isFinite(requestTimeoutMs) || requestTimeoutMs <= 0) {
    throw new Error(`Invalid REQUEST_TIMEOUT_MS: ${env.REQUEST_TIMEOUT_MS}`);
  }

  if (!Number.isFinite(minOrphanAgeDays) || minOrphanAgeDays < 0) {
    throw new Error(`Invalid MIN_ORPHAN_AGE_DAYS: ${env.MIN_ORPHAN_AGE_DAYS}`);
  }

  const config = {
    envPath,
    baseUrl: env.QBITTORRENT_BASE_URL?.trim(),
    username: env.QBITTORRENT_USERNAME?.trim(),
    password: env.QBITTORRENT_PASSWORD?.trim(),
    pathMappings: parsePathMappings(env.PATH_MAPPINGS),
    scanRoots: splitCsv(env.SCAN_ROOTS).map((item) => normalizeAbsolutePath(item)),
    auditMode,
    excludeTags: splitCsv(env.EXCLUDE_TAGS),
    excludeCategories: splitCsv(env.EXCLUDE_CATEGORIES),
    includeCategories: splitCsv(env.INCLUDE_CATEGORIES),
    minOrphanAgeDays,
    dryRun: parseBoolean(env.DRY_RUN, true),
    followSymlinks: parseBoolean(env.FOLLOW_SYMLINKS, false),
    ignoreNames: new Set(splitCsv(env.IGNORE_NAMES)),
    outputFile: resolvePathFromScriptDir(env.OUTPUT_FILE || './orphan-report.json'),
    requestTimeoutMs,
    verbose: parseBoolean(env.VERBOSE, false)
  };

  if (!config.baseUrl || !config.username || !config.password) {
    throw new Error('QBITTORRENT_BASE_URL, QBITTORRENT_USERNAME and QBITTORRENT_PASSWORD are required');
  }

  if (config.pathMappings.length === 0) {
    throw new Error('PATH_MAPPINGS must contain at least one mapping');
  }

  return config;
};

const normalizeAbsolutePath = (inputPath) => {
  const resolved = path.resolve(inputPath);
  return path.normalize(resolved);
};

const normalizeContainerPath = (inputPath) => {
  let normalized = String(inputPath).trim().replace(/\\/g, '/');
  if (!normalized.startsWith('/')) {
    normalized = `/${normalized}`;
  }

  return normalized.replace(/\/+$/, '') || '/';
};

const parsePathMappings = (rawValue) => {
  return splitCsv(rawValue).map((item) => {
    const separatorIndex = item.indexOf(':');
    if (separatorIndex <= 0) {
      throw new Error(`Invalid PATH_MAPPINGS entry: ${item}`);
    }

    const containerPath = normalizeContainerPath(item.slice(0, separatorIndex));
    const hostPath = normalizeAbsolutePath(item.slice(separatorIndex + 1));

    return {
      containerPath,
      hostPath
    };
  });
};

const getMatchingMapping = (mappings, containerPath) => {
  const normalizedPath = normalizeContainerPath(containerPath);
  return [...mappings]
    .sort((left, right) => right.containerPath.length - left.containerPath.length)
    .find((mapping) => {
      return (
        normalizedPath === mapping.containerPath ||
        normalizedPath.startsWith(`${mapping.containerPath}/`)
      );
    });
};

const mapContainerPathToHost = (mappings, containerPath) => {
  const mapping = getMatchingMapping(mappings, containerPath);
  if (!mapping) {
    return null;
  }

  const normalizedPath = normalizeContainerPath(containerPath);
  const relativePath = path.posix.relative(mapping.containerPath, normalizedPath);
  const hostPath = path.normalize(path.join(mapping.hostPath, ...relativePath.split('/')));

  return {
    hostPath,
    mapping
  };
};

class QBittorrentApi {
  constructor(config) {
    this.config = config;
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.sessionCookie = null;
  }

  async request(pathname, options = {}) {
    const headers = {
      ...(options.headers || {})
    };

    if (this.sessionCookie) {
      headers.Cookie = this.sessionCookie;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.requestTimeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}${pathname}`, {
        method: options.method || 'GET',
        headers,
        body: options.body,
        signal: controller.signal
      });

      if (!response.ok) {
        const responseText = await response.text().catch(() => '');
        throw new Error(
          `HTTP ${response.status} ${response.statusText}${responseText ? `: ${responseText}` : ''}`
        );
      }

      return response;
    } finally {
      clearTimeout(timeout);
    }
  }

  async authenticate() {
    const params = new URLSearchParams({
      username: this.config.username,
      password: this.config.password
    });

    const response = await this.request('/api/v2/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });

    const responseText = await response.text();

    if (responseText.trim() !== 'Ok.') {
      throw new Error('qBittorrent authentication failed');
    }

    const setCookieHeader = response.headers.get('set-cookie');
    const sessionCookie = setCookieHeader?.split(';')[0];

    if (!sessionCookie) {
      throw new Error('qBittorrent authentication succeeded but no session cookie was returned');
    }

    this.sessionCookie = sessionCookie;
  }

  async getTorrents() {
    await this.ensureAuthenticated();
    try {
      const response = await this.request('/api/v2/torrents/info');
      return await response.json();
    } catch (error) {
      if (String(error.message || '').includes('HTTP 403')) {
        this.sessionCookie = null;
        await this.authenticate();
        const retryResponse = await this.request('/api/v2/torrents/info');
        return await retryResponse.json();
      }

      throw error;
    }
  }

  async getTorrentFiles(hash) {
    await this.ensureAuthenticated();
    try {
      const response = await this.request(`/api/v2/torrents/files?hash=${encodeURIComponent(hash)}`);
      return await response.json();
    } catch (error) {
      if (String(error.message || '').includes('HTTP 403')) {
        this.sessionCookie = null;
        await this.authenticate();
        const retryResponse = await this.request(
          `/api/v2/torrents/files?hash=${encodeURIComponent(hash)}`
        );
        return await retryResponse.json();
      }

      throw error;
    }
  }

  async ensureAuthenticated() {
    if (!this.sessionCookie) {
      await this.authenticate();
    }
  }
}

const parseTorrentTags = (rawTags) =>
  splitCsv(String(rawTags || '').replace(/,/g, ','));

const isTorrentIncluded = (torrent, config) => {
  const tags = parseTorrentTags(torrent.tags);
  const category = String(torrent.category || '').trim();

  if (config.excludeTags.some((tag) => tags.includes(tag))) {
    return false;
  }

  if (config.excludeCategories.includes(category)) {
    return false;
  }

  if (config.includeCategories.length > 0 && !config.includeCategories.includes(category)) {
    return false;
  }

  return true;
};

const resolveTorrentRootPath = (torrent, mappedSavePath) => {
  const rawContentPath =
    typeof torrent.content_path === 'string' && torrent.content_path.trim().length > 0
      ? torrent.content_path
      : null;

  if (rawContentPath) {
    const filename = path.basename(rawContentPath.replace(/\\/g, '/'));
    return path.normalize(path.join(mappedSavePath, filename));
  }

  return path.normalize(path.join(mappedSavePath, torrent.name));
};

const uniquePaths = (items) => [...new Set(items.map((item) => path.normalize(item)))];

const getAllowedDeletionRoots = (config) => {
  const roots = new Set(config.scanRoots.map((root) => path.normalize(root)));

  for (const mapping of config.pathMappings) {
    roots.add(path.normalize(mapping.hostPath));
  }

  return [...roots];
};

const isPathWithinRoot = (targetPath, rootPath) => {
  const relativePath = path.relative(rootPath, targetPath);
  return (
    relativePath === '' ||
    (!relativePath.startsWith('..') && !path.isAbsolute(relativePath))
  );
};

const isSafeDeletionPath = (targetPath, allowedRoots) => {
  return allowedRoots.some((rootPath) => isPathWithinRoot(targetPath, rootPath));
};

const pathExists = async (targetPath, followSymlinks) => {
  try {
    const stats = followSymlinks ? await fs.stat(targetPath) : await fs.lstat(targetPath);
    return stats;
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return null;
    }

    throw error;
  }
};

const getEntryAgeDays = (mtimeMs) => {
  return (Date.now() - mtimeMs) / (1000 * 60 * 60 * 24);
};

const scanDirectoryEntries = async (directoryPath, config) => {
  try {
    const entries = await fs.readdir(directoryPath, { withFileTypes: true });
    const visibleEntries = [];

    for (const entry of entries) {
      if (config.ignoreNames.has(entry.name)) {
        continue;
      }

      const entryPath = path.join(directoryPath, entry.name);
      const stats = await pathExists(entryPath, config.followSymlinks);
      if (!stats) {
        continue;
      }

      visibleEntries.push({
        name: entry.name,
        path: path.normalize(entryPath),
        type: stats.isDirectory() ? 'directory' : stats.isFile() ? 'file' : 'other',
        ageDays: getEntryAgeDays(stats.mtimeMs),
        sizeBytes: stats.size
      });
    }

    return { entries: visibleEntries, error: null };
  } catch (error) {
    return {
      entries: [],
      error: error instanceof Error ? error.message : String(error)
    };
  }
};

const walkFiles = async (rootPath, config, collector, errors) => {
  let entries;

  try {
    entries = await fs.readdir(rootPath, { withFileTypes: true });
  } catch (error) {
    errors.push({
      path: rootPath,
      message: error instanceof Error ? error.message : String(error)
    });
    return;
  }

  for (const entry of entries) {
    if (config.ignoreNames.has(entry.name)) {
      continue;
    }

    const entryPath = path.join(rootPath, entry.name);
    let stats;

    try {
      stats = config.followSymlinks ? await fs.stat(entryPath) : await fs.lstat(entryPath);
    } catch (error) {
      errors.push({
        path: entryPath,
        message: error instanceof Error ? error.message : String(error)
      });
      continue;
    }

    if (stats.isDirectory()) {
      await walkFiles(entryPath, config, collector, errors);
      continue;
    }

    if (!stats.isFile()) {
      continue;
    }

    collector.push({
      path: path.normalize(entryPath),
      ageDays: getEntryAgeDays(stats.mtimeMs),
      sizeBytes: stats.size
    });
  }
};

const buildFolderModeReport = async (torrents, config) => {
  const expectedEntries = [];
  const unmappedTorrents = [];
  const parentDirectories = new Map();

  for (const torrent of torrents) {
    const mapped = mapContainerPathToHost(config.pathMappings, torrent.save_path || torrent.savePath || '');
    if (!mapped) {
      unmappedTorrents.push({
        hash: torrent.hash,
        name: torrent.name,
        savePath: torrent.save_path || torrent.savePath || ''
      });
      continue;
    }

    const expectedPath = resolveTorrentRootPath(torrent, mapped.hostPath);
    const parentPath = path.dirname(expectedPath);

    expectedEntries.push({
      hash: torrent.hash,
      name: torrent.name,
      savePathContainer: torrent.save_path || torrent.savePath || '',
      savePathHost: mapped.hostPath,
      expectedPath,
      parentPath
    });

    if (!parentDirectories.has(parentPath)) {
      parentDirectories.set(parentPath, []);
    }

    parentDirectories.get(parentPath).push(expectedPath);
  }

  for (const scanRoot of config.scanRoots) {
    if (!parentDirectories.has(scanRoot)) {
      parentDirectories.set(scanRoot, []);
    }
  }

  const orphanCandidates = [];
  const scanErrors = [];
  const missingExpectedEntries = [];

  for (const [parentPath, expectedPaths] of parentDirectories.entries()) {
    const { entries, error } = await scanDirectoryEntries(parentPath, config);
    if (error) {
      scanErrors.push({ path: parentPath, message: error });
      continue;
    }

    const expectedPathSet = new Set(uniquePaths(expectedPaths));
    const diskPathSet = new Set(entries.map((entry) => entry.path));

    for (const expectedPath of expectedPathSet) {
      if (!diskPathSet.has(expectedPath)) {
        missingExpectedEntries.push(expectedPath);
      }
    }

    for (const entry of entries) {
      if (expectedPathSet.has(entry.path)) {
        continue;
      }

      if (entry.ageDays < config.minOrphanAgeDays) {
        continue;
      }

      orphanCandidates.push({
        path: entry.path,
        parentPath,
        type: entry.type,
        ageDays: Number(entry.ageDays.toFixed(2)),
        sizeBytes: entry.sizeBytes,
        reason: 'present_on_disk_but_not_referenced_by_any_torrent_root'
      });
    }
  }

  const uniqueOrphanCandidates = Array.from(
    new Map(orphanCandidates.map((candidate) => [candidate.path, candidate])).values()
  );

  return {
    mode: 'folder',
    expectedEntries,
    orphanCandidates: uniqueOrphanCandidates,
    unmappedTorrents,
    missingExpectedEntries,
    scanErrors
  };
};

const buildFileModeReport = async (api, torrents, config) => {
  const expectedFiles = [];
  const unmappedTorrents = [];
  const scanErrors = [];
  const missingExpectedEntries = [];

  for (const torrent of torrents) {
    const mapped = mapContainerPathToHost(config.pathMappings, torrent.save_path || torrent.savePath || '');
    if (!mapped) {
      unmappedTorrents.push({
        hash: torrent.hash,
        name: torrent.name,
        savePath: torrent.save_path || torrent.savePath || ''
      });
      continue;
    }

    let torrentFiles;

    try {
      torrentFiles = await api.getTorrentFiles(torrent.hash);
    } catch (error) {
      scanErrors.push({
        path: torrent.hash,
        message: error instanceof Error ? error.message : String(error)
      });
      continue;
    }

    for (const torrentFile of torrentFiles) {
      const relativeFilePath = String(torrentFile.name || '').replace(/\\/g, '/');
      const pathParts = relativeFilePath.split('/').filter((part) => part.length > 0);
      const expectedPath = path.normalize(path.join(mapped.hostPath, ...pathParts));
      expectedFiles.push({
        hash: torrent.hash,
        torrent: torrent.name,
        expectedPath
      });
    }
  }

  const expectedFileSet = new Set(uniquePaths(expectedFiles.map((item) => item.expectedPath)));
  const rootsToScan = new Set(config.scanRoots);

  for (const mapping of config.pathMappings) {
    rootsToScan.add(mapping.hostPath);
  }

  const diskFiles = [];

  for (const rootPath of rootsToScan) {
    await walkFiles(rootPath, config, diskFiles, scanErrors);
  }

  for (const expectedPath of expectedFileSet) {
    const stats = await pathExists(expectedPath, config.followSymlinks);
    if (!stats) {
      missingExpectedEntries.push(expectedPath);
    }
  }

  const orphanCandidates = diskFiles
    .filter((file) => !expectedFileSet.has(file.path))
    .filter((file) => file.ageDays >= config.minOrphanAgeDays)
    .map((file) => ({
      path: file.path,
      type: 'file',
      ageDays: Number(file.ageDays.toFixed(2)),
      sizeBytes: file.sizeBytes,
      reason: 'present_on_disk_but_not_referenced_by_any_torrent_file'
    }));

  const uniqueOrphanCandidates = Array.from(
    new Map(orphanCandidates.map((candidate) => [candidate.path, candidate])).values()
  );

  return {
    mode: 'file',
    expectedEntries: expectedFiles,
    orphanCandidates: uniqueOrphanCandidates,
    unmappedTorrents,
    missingExpectedEntries,
    scanErrors
  };
};

const buildReport = async (api, config) => {
  const rawTorrents = await api.getTorrents();
  const includedTorrents = rawTorrents.filter((torrent) => isTorrentIncluded(torrent, config));

  const reportCore =
    config.auditMode === 'file'
      ? await buildFileModeReport(api, includedTorrents, config)
      : await buildFolderModeReport(includedTorrents, config);

  return {
    generatedAt: new Date().toISOString(),
    config: {
      envPath: config.envPath,
      auditMode: config.auditMode,
      minOrphanAgeDays: config.minOrphanAgeDays,
      dryRun: config.dryRun,
      followSymlinks: config.followSymlinks,
      outputFile: config.outputFile,
      scanRoots: config.scanRoots,
      excludeTags: config.excludeTags,
      excludeCategories: config.excludeCategories,
      includeCategories: config.includeCategories
    },
    pathMappings: config.pathMappings,
    summary: {
      totalTorrentsFromApi: rawTorrents.length,
      includedTorrents: includedTorrents.length,
      excludedTorrents: rawTorrents.length - includedTorrents.length,
      orphanCandidates: reportCore.orphanCandidates.length,
      unmappedTorrents: reportCore.unmappedTorrents.length,
      missingExpectedEntries: reportCore.missingExpectedEntries.length,
      scanErrors: reportCore.scanErrors.length,
      dryRun: config.dryRun
    },
    ...reportCore
  };
};

const sortDeletionCandidates = (candidates) => {
  return [...candidates].sort((left, right) => {
    const depthDifference = right.path.split(path.sep).length - left.path.split(path.sep).length;
    if (depthDifference !== 0) {
      return depthDifference;
    }

    return right.path.localeCompare(left.path);
  });
};

const deleteOrphanCandidates = async (report, config) => {
  const allowedRoots = getAllowedDeletionRoots(config);
  const candidates = sortDeletionCandidates(report.orphanCandidates);
  const deletedCandidates = [];
  const deleteErrors = [];

  for (const candidate of candidates) {
    const normalizedCandidatePath = path.normalize(candidate.path);

    if (!isSafeDeletionPath(normalizedCandidatePath, allowedRoots)) {
      deleteErrors.push({
        path: normalizedCandidatePath,
        message: 'Refusing to delete path outside configured roots'
      });
      continue;
    }

    const stats = await pathExists(normalizedCandidatePath, config.followSymlinks);
    if (!stats) {
      continue;
    }

    try {
      await fs.rm(normalizedCandidatePath, {
        recursive: stats.isDirectory(),
        force: false
      });
      deletedCandidates.push(candidate);
    } catch (error) {
      deleteErrors.push({
        path: normalizedCandidatePath,
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return {
    deletedCandidates,
    deleteErrors,
    deletedBytes: deletedCandidates.reduce(
      (total, candidate) => total + Number(candidate.sizeBytes || 0),
      0
    )
  };
};

const shouldBlockDeletion = (report) => {
  return (
    report.summary.unmappedTorrents > 0 ||
    report.summary.missingExpectedEntries > 0 ||
    report.summary.scanErrors > 0
  );
};

const ensureDirectoryForFile = async (filePath) => {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
};

const main = async () => {
  const { envPath } = parseArgs(process.argv.slice(2));
  const config = loadConfig(envPath);

  if (config.verbose) {
    console.log(`[cleanup] Loaded config from ${config.envPath}`);
    console.log(`[cleanup] Audit mode: ${config.auditMode}`);
  }

  const api = new QBittorrentApi(config);
  const report = await buildReport(api, config);

  let deletion = {
    attempted: false,
    blocked: false,
    deletedCandidates: [],
    deleteErrors: [],
    deletedBytes: 0
  };

  if (!config.dryRun) {
    if (shouldBlockDeletion(report)) {
      deletion = {
        ...deletion,
        attempted: true,
        blocked: true
      };
    } else {
      const deletionResult = await deleteOrphanCandidates(report, config);
      deletion = {
        attempted: true,
        blocked: false,
        ...deletionResult
      };
    }
  }

  report.deletion = {
    attempted: deletion.attempted,
    blocked: deletion.blocked,
    deletedCandidates: deletion.deletedCandidates,
    deleteErrors: deletion.deleteErrors,
    deletedBytes: deletion.deletedBytes
  };
  report.summary.deletedCandidates = deletion.deletedCandidates.length;
  report.summary.deleteErrors = deletion.deleteErrors.length;
  report.summary.deletedBytes = deletion.deletedBytes;

  await ensureDirectoryForFile(config.outputFile);
  await fs.writeFile(config.outputFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log('[cleanup] Audit complete');
  console.log(`[cleanup] Report: ${config.outputFile}`);
  console.log(`[cleanup] Torrents included: ${report.summary.includedTorrents}`);
  console.log(`[cleanup] Orphan candidates: ${report.summary.orphanCandidates}`);
  console.log(`[cleanup] Unmapped torrents: ${report.summary.unmappedTorrents}`);
  console.log(`[cleanup] Missing expected entries: ${report.summary.missingExpectedEntries}`);
  console.log(`[cleanup] Scan errors: ${report.summary.scanErrors}`);
  console.log(`[cleanup] Dry run: ${report.summary.dryRun}`);
  console.log(`[cleanup] Deleted candidates: ${report.summary.deletedCandidates}`);
  console.log(`[cleanup] Delete errors: ${report.summary.deleteErrors}`);

  if (deletion.blocked) {
    console.log(
      '[cleanup] Deletion was blocked because the audit found unmapped torrents, missing expected entries, or scan errors'
    );
  }
};

main().catch((error) => {
  console.error('[cleanup] Audit failed');
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exitCode = 1;
});
