import type { DeleteCandidate } from '../models/torrent';

export const limitDeletionCandidates = (
  candidates: DeleteCandidate[],
  maxDeletePerRun: number
): DeleteCandidate[] => candidates.slice(0, maxDeletePerRun);
