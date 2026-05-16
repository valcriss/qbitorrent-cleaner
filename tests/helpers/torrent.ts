import type { Torrent } from '../../src/models/torrent';

export const createTorrent = (overrides?: Partial<Torrent>): Torrent => ({
  hash: 'abc123',
  name: 'Example Torrent',
  ratio: 2.5,
  size: 10 * 1024 * 1024 * 1024,
  progress: 1,
  category: '',
  tags: '',
  savePath: '/downloads',
  addedOn: 1_700_000_000,
  completionOn: 1_700_100_000,
  lastActivity: 1_700_100_000,
  state: 'pausedUP',
  ...overrides
});
