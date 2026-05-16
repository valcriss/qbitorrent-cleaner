import pino from 'pino';

import { config } from '../config/config';

export const logger = pino({
  name: 'qbittorrent-cleaner',
  level: config.logLevel,
  timestamp: pino.stdTimeFunctions.isoTime
});
