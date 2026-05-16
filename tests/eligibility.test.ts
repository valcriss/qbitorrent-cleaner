import { describe, expect, it } from 'vitest';

import { evaluateTorrent, getEligibleTorrents, isProtectedTorrent } from '../src/cleaner/eligibility';
import { createTestConfig } from './helpers/config';
import { createTorrent } from './helpers/torrent';

describe('eligibility rules', () => {
  const now = new Date('2026-05-16T08:00:00.000Z');

  it('matches a torrent when all rules pass', () => {
    const config = createTestConfig();
    const torrent = createTorrent({
      addedOn: Math.floor(new Date('2026-04-01T00:00:00.000Z').getTime() / 1000),
      lastActivity: Math.floor(new Date('2026-04-20T00:00:00.000Z').getTime() / 1000),
      completionOn: Math.floor(new Date('2026-04-18T00:00:00.000Z').getTime() / 1000)
    });

    const candidate = evaluateTorrent(torrent, config, now);

    expect(candidate).not.toBeNull();
    expect(candidate?.inactivityDays).toBeGreaterThanOrEqual(14);
  });

  it('rejects torrents below the ratio threshold', () => {
    const config = createTestConfig();
    const torrent = createTorrent({ ratio: 1.5 });

    expect(evaluateTorrent(torrent, config, now)).toBeNull();
  });

  it('rejects torrents younger than the minimum age', () => {
    const config = createTestConfig();
    const torrent = createTorrent({
      addedOn: Math.floor(new Date('2026-05-12T00:00:00.000Z').getTime() / 1000)
    });

    expect(evaluateTorrent(torrent, config, now)).toBeNull();
  });

  it('uses completion date when last activity is missing', () => {
    const config = createTestConfig();
    const torrent = createTorrent({
      lastActivity: 0,
      completionOn: Math.floor(new Date('2026-04-01T00:00:00.000Z').getTime() / 1000),
      addedOn: Math.floor(new Date('2026-03-20T00:00:00.000Z').getTime() / 1000)
    });

    const candidate = evaluateTorrent(torrent, config, now);

    expect(candidate).not.toBeNull();
    expect(candidate?.inactivityDays).toBeGreaterThan(30);
  });

  it('protects torrents by tag, category and save path', () => {
    const config = createTestConfig();

    expect(isProtectedTorrent(createTorrent({ tags: 'keep,foo' }), config)).toBe(true);
    expect(isProtectedTorrent(createTorrent({ category: 'archive' }), config)).toBe(true);
    expect(
      isProtectedTorrent(createTorrent({ savePath: '/data/permanent/movies' }), config)
    ).toBe(true);
  });

  it('returns eligible torrents sorted by descending size', () => {
    const config = createTestConfig();
    const torrents = [
      createTorrent({
        hash: 'small',
        size: 10,
        addedOn: Math.floor(new Date('2026-04-01T00:00:00.000Z').getTime() / 1000),
        lastActivity: Math.floor(new Date('2026-04-01T00:00:00.000Z').getTime() / 1000)
      }),
      createTorrent({
        hash: 'large',
        size: 20,
        addedOn: Math.floor(new Date('2026-03-01T00:00:00.000Z').getTime() / 1000),
        lastActivity: Math.floor(new Date('2026-03-10T00:00:00.000Z').getTime() / 1000)
      })
    ];

    const eligible = getEligibleTorrents(torrents, config, now);

    expect(eligible.map((item) => item.torrent.hash)).toEqual(['large', 'small']);
  });
});
