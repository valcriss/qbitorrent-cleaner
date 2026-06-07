import type { AppConfig } from '../config/config';

export interface CliOptions {
  apply: boolean;
  configPath?: string;
  runOnce: boolean;
}

export const parseCliOptions = (argv: string[]): CliOptions => {
  let configPath: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--config') {
      configPath = argv[index + 1];
      index += 1;
    }
  }

  const apply = argv.includes('apply') || argv.includes('--apply');
  const runOnce = argv.includes('--run-once') || apply;

  return {
    apply,
    configPath,
    runOnce
  };
};

export const withCliOverrides = (appConfig: AppConfig, options: CliOptions): AppConfig => {
  if (!options.apply) {
    return appConfig;
  }

  return {
    ...appConfig,
    cleaner: {
      ...appConfig.cleaner,
      dryRun: false,
      deleteFiles: true
    },
    scheduler: {
      ...appConfig.scheduler,
      useCron: false
    },
    execution: {
      ...appConfig.execution,
      interactive: false
    }
  };
};
