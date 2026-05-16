const MS_PER_DAY = 24 * 60 * 60 * 1000;

export const unixSecondsToDate = (value: number): Date | null => {
  if (!value || value <= 0) {
    return null;
  }

  return new Date(value * 1000);
};

export const daysBetween = (from: Date, to: Date): number => {
  return Math.floor((to.getTime() - from.getTime()) / MS_PER_DAY);
};

export const getReferenceActivityDate = (
  lastActivitySeconds: number,
  completionOnSeconds: number
): Date | null => {
  return unixSecondsToDate(lastActivitySeconds) ?? unixSecondsToDate(completionOnSeconds);
};
