import { resolve } from "node:path";
import { httpMethods, parseMicros, type HttpMethod } from "@selo/core";
import type { SeloNetworkName } from "@selo/api/networks";
import algosdk from "algosdk";

export class UsageError extends Error {
  override readonly name = "UsageError";
}

type Values = Readonly<Record<string, string | boolean | undefined>>;

const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
const releasePattern = /^[A-Za-z0-9._-]{1,128}$/;
const idPattern = /^[a-z]+_[A-Za-z0-9]{1,60}$/;
const networks: Readonly<Record<string, SeloNetworkName>> = {
  testnet: "algorand-testnet",
  mainnet: "algorand-mainnet",
};

export function text(values: Values, name: string): string {
  const value = values[name];
  if (typeof value !== "string" || value.trim() === "") {
    throw new UsageError(`--${name} is required`);
  }
  return value.trim();
}

export function optionalText(values: Values, name: string): string | null {
  const value = values[name];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

export function flag(values: Values, name: string): boolean {
  return values[name] === true;
}

export function apiOrigin(values: Values): string {
  const value = text(values, "api");
  const url = URL.canParse(value) ? new URL(value) : null;
  const allowed =
    url !== null &&
    (url.protocol === "https:" || (url.protocol === "http:" && loopbackHosts.has(url.hostname)));
  if (url === null || !allowed) {
    throw new UsageError("--api must be an https URL (http only for localhost)");
  }
  return url.origin;
}

export function targetUrl(values: Values): string {
  const value = text(values, "url");
  if (!URL.canParse(value) || new URL(value).protocol !== "https:") {
    throw new UsageError("--url must be the https URL of the paid endpoint");
  }
  return new URL(value).toString();
}

export function method(values: Values): HttpMethod {
  const value = text(values, "method").toUpperCase();
  const found = httpMethods.find((candidate) => candidate === value);
  if (found === undefined) {
    throw new UsageError(`--method must be one of ${httpMethods.join(", ")}`);
  }
  return found;
}

export function id(values: Values, name: string): string {
  const value = text(values, name);
  if (!idPattern.test(value)) {
    throw new UsageError(`--${name} must look like auth_… or pfl_…`);
  }
  return value;
}

export function network(values: Values): SeloNetworkName {
  const value = networks[text(values, "network")];
  if (value === undefined) {
    throw new UsageError("--network must be testnet or mainnet");
  }
  return value;
}

export function usdcMicros(values: Values, name: string): number {
  const micros = parseMicros(text(values, name));
  if (micros === null || micros <= 0) {
    throw new UsageError(`--${name} must be a positive USDC amount such as 1.00`);
  }
  return micros;
}

export function address(values: Values, name: string): string | null {
  const value = optionalText(values, name);
  if (value !== null && !algosdk.isValidAddress(value)) {
    throw new UsageError(`--${name} must be an Algorand address`);
  }
  return value;
}

export function releaseId(values: Values): string {
  const value = text(values, "release");
  if (!releasePattern.test(value)) {
    throw new UsageError("--release must be 1-128 characters of A-Z, a-z, 0-9, '.', '_' or '-'");
  }
  return value;
}

export function fromInvocationDir(path: string): string {
  return resolve(process.env.INIT_CWD ?? process.cwd(), path);
}
