import { describe, expect, it, vi } from 'vitest';

import { TorrentCleaner } from '../src/cleaner/cleaner';
import type { Torrent } from '../src/models/torrent';
import { createTestConfig } from './helpers/config';
import { createTorrent } from './helpers/torrent';

interface ClientStub {
  getTorrents: () => Promise<Torrent[]>;
  deleteTorrents: (hashes: string[], deleteFiles: boolean) => Promise<void>;
}

describe('TorrentCleaner', () => {
  it('does not delete in dry-run mode', async () => {
    const deleteTorrents = vi.fn(async () => undefined);
    const client: ClientStub = {
      getTorrents: async () => [
        createTorrent({
          hash: 'one',
          addedOn: Math.floor(new Date('2026-03-01T00:00:00.000Z').getTime() / 1000),
          lastActivity: Math.floor(new Date('2026-03-10T00:00:00.000Z').getTime() / 1000)
        })
      ],
      deleteTorrents
    };

    const cleaner = new TorrentCleaner(client as never, createTestConfig());
    const summary = await cleaner.run();

    expect(deleteTorrents).not.toHaveBeenCalled();
    expect(summary.deleted).toBe(0);
    expect(summary.matched).toBe(1);
  });

  it('enforces the maximum deletion limit', async () => {
    const deleteTorrents = vi.fn(async () => undefined);
    const client: ClientStub = {
      getTorrents: async () =>
        Array.from({ length: 3 }, (_, index) =>
          createTorrent({
            hash: `hash-${index}`,
            size: 100 - index,
            addedOn: Math.floor(new Date('2026-02-01T00:00:00.000Z').getTime() / 1000),
            lastActivity: Math.floor(new Date('2026-02-10T00:00:00.000Z').getTime() / 1000)
          })
        ),
      deleteTorrents
    };

    const config = createTestConfig({
      cleaner: {
        ...createTestConfig().cleaner,
        dryRun: false,
        maxDeletePerRun: 2
      }
    });
    const cleaner = new TorrentCleaner(client as never, config);
    const summary = await cleaner.run();

    expect(deleteTorrents).toHaveBeenCalledWith(['hash-0', 'hash-1'], false);
    expect(summary.deleted).toBe(2);
  });

  it('ignores incomplete torrents when only completed is enabled', async () => {
    const deleteTorrents = vi.fn(async () => undefined);
    const client: ClientStub = {
      getTorrents: async () => [
        createTorrent({
          hash: 'incomplete',
          progress: 0.5,
          addedOn: Math.floor(new Date('2026-02-01T00:00:00.000Z').getTime() / 1000),
          lastActivity: Math.floor(new Date('2026-02-10T00:00:00.000Z').getTime() / 1000)
        })
      ],
      deleteTorrents
    };

    const cleaner = new TorrentCleaner(client as never, createTestConfig());
    const summary = await cleaner.run();

    expect(summary.matched).toBe(0);
    expect(deleteTorrents).not.toHaveBeenCalled();
  });
});
