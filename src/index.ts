import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { createReadStream, createWriteStream } from 'node:fs';
import cron from 'node-cron';

import { QBittorrentClient } from './api/qbittorrentClient';
import { TorrentCleaner } from './cleaner/cleaner';
import { config, type AppConfig } from './config/config';
import type { CleanupSummary } from './models/torrent';
import { parseCliOptions, withCliOverrides } from './utils/cli';
import {
  canUseProcessTty,
  isConfirmedAnswer,
  shouldAttemptWindowsConsoleFallback
} from './utils/interactive';
import { logger } from './utils/logger';

const withDryRun = (appConfig: AppConfig, dryRun: boolean): AppConfig => ({
  ...appConfig,
  cleaner: {
    ...appConfig.cleaner,
    dryRun
  }
});

const runCleaner = async (appConfig: AppConfig = config): Promise<CleanupSummary | null> => {
  const client = new QBittorrentClient(appConfig);
  const cleaner = new TorrentCleaner(client, appConfig);

  try {
    return await cleaner.run();
  } catch (error) {
    logger.error({ err: error }, 'Cleaner run failed');
    process.exitCode = 1;
    return null;
  }
};

const waitForConsoleFlush = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 50));
};

const getInteractiveIo = (): {
  inputStream: NodeJS.ReadableStream;
  outputStream: NodeJS.WritableStream;
  close: () => void;
} | null => {
  if (canUseProcessTty(input.isTTY, output.isTTY)) {
    return {
      inputStream: input,
      outputStream: output,
      close: () => undefined
    };
  }

  if (shouldAttemptWindowsConsoleFallback(process.platform, input.isTTY, output.isTTY)) {
    try {
      const fallbackInput = createReadStream('CONIN$');
      const fallbackOutput = createWriteStream('CONOUT$');

      return {
        inputStream: fallbackInput,
        outputStream: fallbackOutput,
        close: () => {
          fallbackInput.destroy();
          fallbackOutput.end();
        }
      };
    } catch (error) {
      logger.warn(
        { err: error },
        'Unable to open Windows console fallback for interactive confirmation'
      );
    }
  }

  return null;
};

const promptInteractiveConfirmation = async (): Promise<boolean> => {
  const io = getInteractiveIo();
  if (!io) {
    logger.warn(
      'INTERACTIVE=true but no interactive console is available, keeping dry-run result and skipping deletion'
    );
    return false;
  }

  const readline = createInterface({
    input: io.inputStream,
    output: io.outputStream
  });

  try {
    io.outputStream.write(
      '\nInteractive mode: type Y then press Enter to confirm deletion. Press Enter alone to cancel.\n\n'
    );

    const answer = await readline.question(
      'Proceed with real deletion? [Y/n] (default: N): '
    );

    return isConfirmedAnswer(answer);
  } finally {
    readline.close();
    io.close();
  }
};

const runInteractiveCleaner = async (): Promise<void> => {
  logger.info('INTERACTIVE=true, running dry-run analysis before confirmation');

  const dryRunSummary = await runCleaner(withDryRun(config, true));
  if (!dryRunSummary || dryRunSummary.candidates.length === 0) {
    return;
  }

  await waitForConsoleFlush();

  const confirmed = await promptInteractiveConfirmation();
  if (!confirmed) {
    logger.info('Deletion cancelled, no torrent was removed');
    return;
  }

  await runCleaner(withDryRun(config, false));
};

const main = async (): Promise<void> => {
  const cliOptions = parseCliOptions(process.argv.slice(2));
  const appConfig = withCliOverrides(config, cliOptions);

  if (cliOptions.configPath) {
    logger.warn(
      { configPath: cliOptions.configPath },
      'CLI config files are not supported yet, continuing with environment-based configuration'
    );
  }

  if (cliOptions.runOnce) {
    if (appConfig.execution.interactive) {
      await runInteractiveCleaner();
      return;
    }

    await runCleaner(appConfig);
    return;
  }

  if (!appConfig.scheduler.useCron) {
    logger.info('USE_CRON=false, running cleaner immediately without scheduler');
    if (appConfig.execution.interactive) {
      await runInteractiveCleaner();
      return;
    }

    await runCleaner(appConfig);
    return;
  }

  logger.info({ cron: appConfig.scheduler.cronSchedule }, 'Scheduling cleaner');
  cron.schedule(appConfig.scheduler.cronSchedule, () => {
    if (appConfig.execution.interactive) {
      void runInteractiveCleaner();
      return;
    }

    void runCleaner(appConfig);
  });

  if (appConfig.execution.interactive) {
    await runInteractiveCleaner();
    return;
  }

  await runCleaner(appConfig);
};

void main();
