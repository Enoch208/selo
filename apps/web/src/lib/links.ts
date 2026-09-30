export const links = {
  repo: "https://github.com/Enoch208/selo",
  claims: "https://github.com/Enoch208/selo/blob/main/docs/CLAIMS.md",
  evidence: "https://github.com/Enoch208/selo/tree/main/docs/evidence",
  roundTripEvidence:
    "https://github.com/Enoch208/selo/blob/main/docs/evidence/g2-orchestrator-roundtrip-2-retest.json",
  leaderboardEvidence:
    "https://github.com/Enoch208/selo/blob/main/docs/evidence/g1-leaderboard.json",
  bazaarEvidence:
    "https://github.com/Enoch208/selo/blob/main/docs/evidence/g1-bazaar-resource.json",
  pilotEvidence:
    "https://github.com/Enoch208/selo/blob/main/docs/evidence/g4-external-pilot-summary.md",
  apiDocs: "/llms.txt",
} as const;

export function explorerTx(txId: string): string {
  return `https://allo.info/tx/${encodeURIComponent(txId)}`;
}

export function shortId(value: string): string {
  return value.length > 14 ? `${value.slice(0, 8)}…${value.slice(-4)}` : value;
}
