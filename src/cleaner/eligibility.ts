import type { AppConfig } from '../config/config';
import type { DeleteCandidate, Torrent } from '../models/torrent';
import { daysBetween, getReferenceActivityDate, unixSecondsToDate } from '../utils/dates';

const normalizePath = (value: string): string => value.replace(/[\\/]+$/, '').toLowerCase();

const parseTags = (rawTags: string): string[] =>
  rawTags
    .split(',')
    .map((tag) => tag.trim().toLowerCase())
    .filter((tag) => tag.length > 0);

export const isCompletedTorrent = (torrent: Torrent): boolean => torrent.progress >= 1;

export const isProtectedTorrent = (torrent: Torrent, appConfig: AppConfig): boolean => {
  const tags = parseTags(torrent.tags);
  const category = torrent.category.trim().toLowerCase();
  const savePath = normalizePath(torrent.savePath);

  if (tags.some((tag) => appConfig.cleaner.excludedTags.map((item) => item.toLowerCase()).includes(tag))) {
    return true;
  }

  if (
    appConfig.cleaner.protectedCategories
      .map((item) => item.toLowerCase())
      .includes(category)
  ) {
    return true;
  }

  return appConfig.cleaner.protectedSavePaths.some((path) => {
    const protectedPath = normalizePath(path);
    return savePath === protectedPath || savePath.startsWith(`${protectedPath}/`) || savePath.startsWith(`${protectedPath}\\`);
  });
};

export const evaluateTorrent = (
  torrent: Torrent,
  appConfig: AppConfig,
  now: Date = new Date()
): DeleteCandidate | null => {
  if (isProtectedTorrent(torrent, appConfig)) {
    return null;
  }

  if (appConfig.cleaner.onlyCompleted && !isCompletedTorrent(torrent)) {
    return null;
  }

  const addedOnDate = unixSecondsToDate(torrent.addedOn);
  if (!addedOnDate) {
    return null;
  }

  const ageDays = daysBetween(addedOnDate, now);
  if (ageDays < appConfig.cleaner.minTorrentAgeDays) {
    return null;
  }

  if (torrent.ratio < appConfig.cleaner.minRatio) {
    return null;
  }

  const activityDate = getReferenceActivityDate(torrent.lastActivity, torrent.completionOn);
  if (!activityDate) {
    return null;
  }

  const inactivityDays = daysBetween(activityDate, now);
  if (inactivityDays < appConfig.cleaner.inactiveDays) {
    return null;
  }

  return {
    torrent,
    matchedReasons: [
      `ratio>=${appConfig.cleaner.minRatio}`,
      `inactive>=${appConfig.cleaner.inactiveDays}d`,
      `age>=${appConfig.cleaner.minTorrentAgeDays}d`
    ],
    inactivityDays,
    ageDays
  };
};

export const getEligibleTorrents = (
  torrents: Torrent[],
  appConfig: AppConfig,
  now: Date = new Date()
): DeleteCandidate[] => {
  return torrents
    .map((torrent) => evaluateTorrent(torrent, appConfig, now))
    .filter((candidate): candidate is DeleteCandidate => candidate !== null)
    .sort((left, right) => right.torrent.size - left.torrent.size);
};
