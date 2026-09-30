import type { LeaderboardRow, MerchantRecord, ResourceRecord } from "./facilitator-schemas";

function hostOf(url: string): string | null {
  return URL.canParse(url) ? new URL(url).hostname.toLowerCase() : null;
}

export function resourcesForDomain(
  items: readonly ResourceRecord[],
  domain: string,
): ResourceRecord[] {
  const wanted = domain.toLowerCase();
  return items.filter((item) => hostOf(item.resourceUrl) === wanted);
}

export function merchantsFor(items: readonly MerchantRecord[], payTo: string): MerchantRecord[] {
  return items.filter((item) => item.addresses.avm === payTo);
}

export function leaderboardRowsFor(
  items: readonly LeaderboardRow[],
  payTo: string,
): LeaderboardRow[] {
  return items.filter((row) => row.address === payTo);
}

export interface PageProgress {
  readonly offset: number;
  readonly received: number;
  readonly total: number;
}

export function nextOffset(progress: PageProgress): number | null {
  const next = progress.offset + progress.received;
  return progress.received > 0 && next < progress.total ? next : null;
}
