import { createHmac } from "node:crypto";
import { publicUrl } from "../http/public-url";

const tokenPattern = /^[A-Za-z0-9_-]{43}$/;

export function reportToken(secret: string, jobId: string): string {
  return createHmac("sha256", secret).update(jobId).digest("base64url");
}

export function isReportToken(value: string): boolean {
  return tokenPattern.test(value);
}

export function reportUrlFor(publicBaseUrl: string, token: string): string {
  return publicUrl(publicBaseUrl, `/v1/reports/${token}`);
}
