import { algorandWords } from "./algorand-words";

const wordRun = /\b[a-z]{3,8}(?:[\s,]+[a-z]{3,8}){23,}\b/gi;
const wordToken = /[a-z]+/gi;
const minimumWords = 24;
const mnemonicWords = 25;
const minimumShare = 0.9;

interface Token {
  readonly start: number;
  readonly end: number;
  readonly known: boolean;
}

interface Cluster {
  readonly first: number;
  readonly last: number;
  readonly known: number;
}

function tokensOf(run: string): readonly Token[] {
  const dictionary = algorandWords();
  return Array.from(run.matchAll(wordToken), (match) => ({
    start: match.index,
    end: match.index + match[0].length,
    known: dictionary.has(match[0].toLowerCase()),
  }));
}

const sizeOf = (cluster: Cluster): number => cluster.last - cluster.first + 1;

const share = (cluster: Cluster): number => cluster.known / sizeOf(cluster);

function toleratesUnknowns(cluster: Cluster): boolean {
  const allowed = Math.floor((1 - minimumShare) * Math.max(sizeOf(cluster), mnemonicWords));
  return sizeOf(cluster) - cluster.known <= allowed;
}

const isMnemonicLike = (cluster: Cluster): boolean =>
  sizeOf(cluster) >= minimumWords && share(cluster) >= minimumShare;

function clustersOf(tokens: readonly Token[]): readonly Cluster[] {
  const clusters: Cluster[] = [];
  let current: Cluster | null = null;
  for (const [index, token] of tokens.entries()) {
    if (!token.known) {
      continue;
    }
    const grown: Cluster | null =
      current === null ? null : { first: current.first, last: index, known: current.known + 1 };
    if (grown !== null && toleratesUnknowns(grown)) {
      current = grown;
      continue;
    }
    if (current !== null) {
      clusters.push(current);
    }
    current = { first: index, last: index, known: 1 };
  }
  if (current !== null) {
    clusters.push(current);
  }
  return clusters.filter(isMnemonicLike);
}

function hashClusters(run: string, hash: (secret: string) => string): string {
  const tokens = tokensOf(run);
  let output = "";
  let cursor = 0;
  for (const cluster of clustersOf(tokens)) {
    const start = tokens[cluster.first]?.start ?? cursor;
    const end = tokens[cluster.last]?.end ?? start;
    output += run.slice(cursor, start) + hash(run.slice(start, end));
    cursor = end;
  }
  return output + run.slice(cursor);
}

export function scrubMnemonics(text: string, hash: (secret: string) => string): string {
  return text.replace(wordRun, (run) => hashClusters(run, hash));
}
