export const isConfirmedAnswer = (answer: string | undefined): boolean => {
  if (!answer) {
    return false;
  }

  return ['y', 'yes'].includes(answer.trim().toLowerCase());
};

export const canUseProcessTty = (
  inputIsTTY: boolean | undefined,
  outputIsTTY: boolean | undefined
): boolean => Boolean(inputIsTTY && outputIsTTY);

export const shouldAttemptWindowsConsoleFallback = (
  platform: NodeJS.Platform,
  inputIsTTY: boolean | undefined,
  outputIsTTY: boolean | undefined
): boolean => platform === 'win32' && !canUseProcessTty(inputIsTTY, outputIsTTY);
