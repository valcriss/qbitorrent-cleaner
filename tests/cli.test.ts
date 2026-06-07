import { describe, expect, it } from 'vitest';

import { parseCliOptions, withCliOverrides } from '../src/utils/cli';
import { createTestConfig } from './helpers/config';

describe('CLI options', () => {
  it('detects apply mode and config path arguments', () => {
    const options = parseCliOptions(['apply', '--config', 'config.yml', '--apply']);

    expect(options).toEqual({
      apply: true,
      configPath: 'config.yml',
      runOnce: true
    });
  });

  it('forces real deletion with file cleanup in apply mode', () => {
    const config = createTestConfig({
      cleaner: {
        ...createTestConfig().cleaner,
        dryRun: true,
        deleteFiles: false
      },
      scheduler: {
        useCron: true,
        cronSchedule: '0 3 * * *'
      },
      execution: {
        interactive: true
      }
    });

    const overridden = withCliOverrides(config, {
      apply: true,
      configPath: 'config.yml',
      runOnce: true
    });

    expect(overridden.cleaner.dryRun).toBe(false);
    expect(overridden.cleaner.deleteFiles).toBe(true);
    expect(overridden.scheduler.useCron).toBe(false);
    expect(overridden.execution.interactive).toBe(false);
  });
});
