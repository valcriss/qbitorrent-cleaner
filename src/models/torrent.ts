export interface Torrent {
  hash: string;
  name: string;
  ratio: number;
  size: number;
  progress: number;
  category: string;
  tags: string;
  savePath: string;
  addedOn: number;
  completionOn: number;
  lastActivity: number;
  state: string;
}

export interface DeleteCandidate {
  torrent: Torrent;
  matchedReasons: string[];
  inactivityDays: number;
  ageDays: number;
}

export interface CleanupSummary {
  scanned: number;
  matched: number;
  deleted: number;
  recoveredBytes: number;
  dryRun: boolean;
  candidates: DeleteCandidate[];
}
