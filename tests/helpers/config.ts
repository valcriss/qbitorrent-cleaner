import type { AppConfig } from '../../src/config/config';

export const createTestConfig = (overrides?: Partial<AppConfig>): AppConfig => ({
  qbittorrent: {
    baseUrl: 'http://localhost:8080',
    username: 'admin',
    password: 'adminadmin',
    requestTimeoutMs: 10000
  },
  cleaner: {
    dryRun: true,
    deleteFiles: false,
    onlyCompleted: true,
    minRatio: 2,
    inactiveDays: 14,
    minTorrentAgeDays: 7,
    maxDeletePerRun: 5,
    excludedTags: ['keep'],
    protectedCategories: ['archive', 'linux-isos'],
    protectedSavePaths: ['/data/permanent', '/data/archive']
  },
  scheduler: {
    useCron: true,
    cronSchedule: '0 3 * * *'
  },
  execution: {
    interactive: false
  },
  logLevel: 'info',
  ...overrides
});
