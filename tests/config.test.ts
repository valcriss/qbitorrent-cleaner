import { describe, expect, it } from 'vitest';

describe('environment booleans', () => {
  it('parses "false" from dotenv-style strings as false', async () => {
    process.env.QBITTORRENT_BASE_URL = 'http://localhost:8080';
    process.env.QBITTORRENT_USERNAME = 'admin';
    process.env.QBITTORRENT_PASSWORD = 'adminadmin';
    process.env.DRY_RUN = 'false';
    process.env.DELETE_FILES = 'false';
    process.env.ONLY_COMPLETED = 'true';
    process.env.USE_CRON = 'false';
    process.env.INTERACTIVE = 'true';

    const uniqueImportPath = `../src/config/config.ts?case=${Date.now()}`;
    const { config } = await import(uniqueImportPath);

    expect(config.cleaner.dryRun).toBe(false);
    expect(config.scheduler.useCron).toBe(false);
    expect(config.execution.interactive).toBe(true);
  });
});
