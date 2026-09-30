import type { HttpMethod } from "./contract";

export type AddressClass = "public" | "blocked" | "invalid";
export type HostnameClass = "ok" | "ip_literal" | "blocked_name";

export interface AuthorizedTarget {
  readonly origin: string;
  readonly routePath: string;
  readonly method: HttpMethod;
}

export interface RequestedTarget {
  readonly origin: string;
  readonly path: string;
  readonly method: HttpMethod;
}

type Octets = readonly [number, number, number, number];

const toUint32 = ([a, b, c, d]: Octets): number => ((a << 24) >>> 0) + (b << 16) + (c << 8) + d;

const blockedIpv4Ranges: readonly (readonly [number, number])[] = (
  [
    [[0, 0, 0, 0], 8],
    [[10, 0, 0, 0], 8],
    [[100, 64, 0, 0], 10],
    [[127, 0, 0, 0], 8],
    [[169, 254, 0, 0], 16],
    [[172, 16, 0, 0], 12],
    [[192, 0, 0, 0], 24],
    [[192, 0, 2, 0], 24],
    [[192, 88, 99, 0], 24],
    [[192, 168, 0, 0], 16],
    [[198, 18, 0, 0], 15],
    [[198, 51, 100, 0], 24],
    [[203, 0, 113, 0], 24],
    [[224, 0, 0, 0], 4],
    [[240, 0, 0, 0], 4],
  ] as const
).map(([octets, prefix]) => [toUint32(octets), prefix] as const);

const blockedNameSuffixes = [".localhost", ".local", ".internal", ".home.arpa", ".lan"] as const;

const ipv4Pattern = /^(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})$/;
const hexGroupPattern = /^[0-9a-f]{1,4}$/i;
const numericLabelPattern = /^(\d+|0x[0-9a-f]*)$/;

function parseIpv4(input: string): number | null {
  const match = ipv4Pattern.exec(input);
  if (match === null) {
    return null;
  }
  const octets = match.slice(1).map(Number);
  const [a, b, c, d] = octets;
  if (a === undefined || b === undefined || c === undefined || d === undefined) {
    return null;
  }
  if (octets.some((octet) => octet > 255)) {
    return null;
  }
  return toUint32([a, b, c, d]);
}

function inIpv4Range(value: number, base: number, prefix: number): boolean {
  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  return (value & mask) >>> 0 === (base & mask) >>> 0;
}

function classifyIpv4(value: number): AddressClass {
  const blocked = blockedIpv4Ranges.some(([base, prefix]) => inIpv4Range(value, base, prefix));
  return blocked ? "blocked" : "public";
}

function parseGroups(text: string, allowIpv4Tail: boolean): number[] | null {
  if (text === "") {
    return [];
  }
  const parts = text.split(":");
  const groups: number[] = [];
  for (const [index, part] of parts.entries()) {
    if (allowIpv4Tail && index === parts.length - 1 && part.includes(".")) {
      const embedded = parseIpv4(part);
      if (embedded === null) {
        return null;
      }
      groups.push(embedded >>> 16, embedded & 0xffff);
    } else if (hexGroupPattern.test(part)) {
      groups.push(Number.parseInt(part, 16));
    } else {
      return null;
    }
  }
  return groups;
}

function parseIpv6(input: string): readonly number[] | null {
  const halves = input.split("::");
  if (halves.length > 2) {
    return null;
  }
  const [first = "", second] = halves;
  if (second === undefined) {
    const groups = parseGroups(first, true);
    return groups !== null && groups.length === 8 ? groups : null;
  }
  const head = parseGroups(first, false);
  const tail = parseGroups(second, true);
  if (head === null || tail === null) {
    return null;
  }
  const missing = 8 - head.length - tail.length;
  return missing >= 1 ? [...head, ...new Array<number>(missing).fill(0), ...tail] : null;
}

function embeddedIpv4(high: number | undefined, low: number | undefined): number {
  return (((high ?? 0) << 16) >>> 0) + (low ?? 0);
}

function allZero(groups: readonly number[]): boolean {
  return groups.every((group) => group === 0);
}

function classifyIpv6(groups: readonly number[]): AddressClass {
  const [g0 = 0, g1 = 0, g2, , , g5 = 0, g6, g7] = groups;
  if (allZero(groups.slice(0, 5)) && (g5 === 0 || g5 === 0xffff)) {
    return classifyIpv4(embeddedIpv4(g6, g7));
  }
  if (g0 === 0x64 && g1 === 0xff9b && allZero(groups.slice(2, 6))) {
    return classifyIpv4(embeddedIpv4(g6, g7));
  }
  if (g0 === 0x2002) {
    return classifyIpv4(embeddedIpv4(g1, g2));
  }
  if ((g0 & 0xe000) !== 0x2000) {
    return "blocked";
  }
  if (g0 === 0x2001 && (g1 === 0 || g1 === 0x0db8)) {
    return "blocked";
  }
  return "public";
}

export function classifyAddress(ip: string): AddressClass {
  const ipv4 = parseIpv4(ip);
  if (ipv4 !== null) {
    return classifyIpv4(ipv4);
  }
  const zoneAt = ip.indexOf("%");
  if (zoneAt >= 0) {
    return zoneAt > 0 && parseIpv6(ip.slice(0, zoneAt)) !== null ? "blocked" : "invalid";
  }
  const ipv6 = parseIpv6(ip);
  return ipv6 === null ? "invalid" : classifyIpv6(ipv6);
}

export function classifyHostname(hostname: string): HostnameClass {
  const name = hostname.toLowerCase().replace(/\.$/, "");
  const labels = name.split(".");
  const lastLabel = labels[labels.length - 1] ?? "";
  if (name.startsWith("[") || name.includes(":") || numericLabelPattern.test(lastLabel)) {
    return "ip_literal";
  }
  if (labels.length < 2 || labels.some((label) => label === "")) {
    return "blocked_name";
  }
  if (blockedNameSuffixes.some((suffix) => name.endsWith(suffix))) {
    return "blocked_name";
  }
  return "ok";
}

export function targetCovered(authorized: AuthorizedTarget, requested: RequestedTarget): boolean {
  return (
    authorized.origin === requested.origin &&
    authorized.routePath === requested.path &&
    authorized.method === requested.method
  );
}
