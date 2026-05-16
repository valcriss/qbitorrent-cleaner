export const formatBytes = (value: number): string => {
  if (value < 1024) {
    return `${value} B`;
  }

  const units = ['KB', 'MB', 'GB', 'TB'];
  let amount = value;
  let unitIndex = -1;

  while (amount >= 1024 && unitIndex < units.length - 1) {
    amount /= 1024;
    unitIndex += 1;
  }

  return `${amount.toFixed(2)} ${units[unitIndex]}`;
};
