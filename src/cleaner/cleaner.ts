import type { QBittorrentClient } from '../api/qbittorrentClient';
import type { AppConfig } from '../config/config';
import type { CleanupSummary, DeleteCandidate } from '../models/torrent';
import { formatBytes } from '../utils/bytes';
import { logger } from '../utils/logger';

import { limitDeletionCandidates } from './deletion';
import { getEligibleTorrents } from './eligibility';

const logCandidate = (candidate: DeleteCandidate, dryRun: boolean): void => {
  logger.info(
    {
      torrent: candidate.torrent.name,
      hash: candidate.torrent.hash,
      ratio: candidate.torrent.ratio,
      inactivityDays: candidate.inactivityDays,
      ageDays: candidate.ageDays,
      size: candidate.torrent.size,
      sizeHuman: formatBytes(candidate.torrent.size),
      savePath: candidate.torrent.savePath,
      dryRun
    },
    dryRun ? 'Dry-run deletion candidate' : 'Deleting torrent'
  );
};

export class TorrentCleaner {
  public constructor(
    private readonly client: QBittorrentClient,
    private readonly appConfig: AppConfig
  ) {}

  public async run(): Promise<CleanupSummary> {
    const torrents = await this.client.getTorrents();
    const eligible = getEligibleTorrents(torrents, this.appConfig);
    const limitedCandidates = limitDeletionCandidates(
      eligible,
      this.appConfig.cleaner.maxDeletePerRun
    );

    limitedCandidates.forEach((candidate) =>
      logCandidate(candidate, this.appConfig.cleaner.dryRun)
    );

    if (!this.appConfig.cleaner.dryRun && limitedCandidates.length > 0) {
      await this.client.deleteTorrents(
        limitedCandidates.map((candidate) => candidate.torrent.hash),
        this.appConfig.cleaner.deleteFiles
      );
    }

    const summary: CleanupSummary = {
      scanned: torrents.length,
      matched: eligible.length,
      deleted: this.appConfig.cleaner.dryRun ? 0 : limitedCandidates.length,
      recoveredBytes: limitedCandidates.reduce(
        (total, candidate) => total + candidate.torrent.size,
        0
      ),
      dryRun: this.appConfig.cleaner.dryRun,
      candidates: limitedCandidates
    };

    logger.info(
      {
        scanned: summary.scanned,
        matched: summary.matched,
        deleted: summary.deleted,
        recoveredBytes: summary.recoveredBytes,
        recoveredHuman: formatBytes(summary.recoveredBytes),
        dryRun: summary.dryRun
      },
      'Cleaner summary'
    );

    return summary;
  }
}
