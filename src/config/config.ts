import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const booleanFromEnv = z
  .string()
  .trim()
  .toLowerCase()
  .transform((value, ctx) => {
    if (['true', '1', 'yes', 'on'].includes(value)) {
      return true;
    }

    if (['false', '0', 'no', 'off'].includes(value)) {
      return false;
    }

    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Expected a boolean-like value'
    });

    return z.NEVER;
  });

const envSchema = z.object({
  QBITTORRENT_BASE_URL: z.string().url(),
  QBITTORRENT_USERNAME: z.string().min(1),
  QBITTORRENT_PASSWORD: z.string().min(1),
  DRY_RUN: booleanFromEnv.default('true'),
  DELETE_FILES: booleanFromEnv.default('false'),
  ONLY_COMPLETED: booleanFromEnv.default('true'),
  MIN_RATIO: z.coerce.number().nonnegative().default(2),
  INACTIVE_DAYS: z.coerce.number().int().nonnegative().default(14),
  MIN_TORRENT_AGE_DAYS: z.coerce.number().int().nonnegative().default(7),
  MAX_DELETE_PER_RUN: z.coerce.number().int().positive().default(5),
  EXCLUDED_TAG: z.string().default('keep'),
  PROTECTED_CATEGORIES: z.string().optional().default(''),
  PROTECTED_SAVE_PATHS: z.string().optional().default(''),
  REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
  INTERACTIVE: booleanFromEnv.default('false'),
  USE_CRON: booleanFromEnv.default('true'),
  CRON_SCHEDULE: z.string().default('0 3 * * *'),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info')
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  throw new Error(`Invalid environment configuration: ${parsedEnv.error.message}`);
}

const splitCsv = (value: string): string[] =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

export const config = {
  qbittorrent: {
    baseUrl: parsedEnv.data.QBITTORRENT_BASE_URL.replace(/\/+$/, ''),
    username: parsedEnv.data.QBITTORRENT_USERNAME,
    password: parsedEnv.data.QBITTORRENT_PASSWORD,
    requestTimeoutMs: parsedEnv.data.REQUEST_TIMEOUT_MS
  },
  cleaner: {
    dryRun: parsedEnv.data.DRY_RUN,
    deleteFiles: parsedEnv.data.DELETE_FILES,
    onlyCompleted: parsedEnv.data.ONLY_COMPLETED,
    minRatio: parsedEnv.data.MIN_RATIO,
    inactiveDays: parsedEnv.data.INACTIVE_DAYS,
    minTorrentAgeDays: parsedEnv.data.MIN_TORRENT_AGE_DAYS,
    maxDeletePerRun: parsedEnv.data.MAX_DELETE_PER_RUN,
    excludedTags: splitCsv(parsedEnv.data.EXCLUDED_TAG),
    protectedCategories: splitCsv(parsedEnv.data.PROTECTED_CATEGORIES),
    protectedSavePaths: splitCsv(parsedEnv.data.PROTECTED_SAVE_PATHS)
  },
  scheduler: {
    useCron: parsedEnv.data.USE_CRON,
    cronSchedule: parsedEnv.data.CRON_SCHEDULE
  },
  execution: {
    interactive: parsedEnv.data.INTERACTIVE
  },
  logLevel: parsedEnv.data.LOG_LEVEL
} as const;

export type AppConfig = typeof config;
