export const HOT_TIME_DIVISOR_SECONDS = 129_600;

export function hotRank(netScore: number, createdAt: Date): number {
  const voteWeight = Math.sign(netScore) * Math.log2(Math.abs(netScore) + 1);
  return voteWeight + createdAt.getTime() / 1_000 / HOT_TIME_DIVISOR_SECONDS;
}
