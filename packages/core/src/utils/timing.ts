export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function applySpeed(delay: number, speedMultiplier = 1): number {
  if (speedMultiplier <= 0) {
    return 0;
  }

  return delay / speedMultiplier;
}
