import { z } from "zod";
import type { CheckResult, CheckStatus, HttpMethod } from "../contract";
import { formatMicros, parseAtomicUnits } from "../money";
import type { AlgorandRequirement } from "./challenge";
import { acceptSchema } from "./challenge";
import { isRecordValue } from "./object-guards";

const catalogRecordSchema = z
  .object({
    id: z.string(),
    resourceUrl: z.string(),
    method: z.string(),
    description: z.string().optional(),
    mimeType: z.string().optional(),
    merchantId: z.string().optional(),
    accepts: z.array(acceptSchema),
    discoveryInfo: z.unknown().optional(),
    settleCount: z.number().optional(),
    firstSeen: z.string().optional(),
    lastSeen: z.string().optional(),
  })
  .loose();

type CatalogRecord = z.infer<typeof catalogRecordSchema>;

export interface DiscoveryTarget {
  readonly url: string;
  readonly method: HttpMethod;
}

export interface LiveResource {
  readonly description?: string;
  readonly mimeType?: string;
}

export type CatalogLookup =
  | { readonly kind: "found"; readonly record: unknown }
  | { readonly kind: "not_found" }
  | { readonly kind: "unavailable" };

export interface EvaluateDiscoveryInput {
  readonly target: DiscoveryTarget;
  readonly requirement: AlgorandRequirement;
  readonly liveInfo: unknown;
  readonly liveResource: LiveResource | null;
  readonly catalog: CatalogLookup;
  readonly evidence: readonly string[];
}

function declaredMethod(info: unknown): string | null {
  if (!isRecordValue(info)) {
    return null;
  }
  const input = info.input;
  if (!isRecordValue(input) || typeof input.method !== "string") {
    return null;
  }
  return input.method;
}

function outputExamplePresent(info: unknown): boolean {
  if (!isRecordValue(info)) {
    return false;
  }
  const output = info.output;
  return isRecordValue(output) && output.example !== undefined;
}

function build(
  evidence: readonly string[],
  status: CheckStatus,
  code: string,
  summary: string,
): CheckResult {
  return { id: "discovery_contract", status, code, blocking: true, summary, evidence };
}

function evaluateCatalogRecord(
  input: EvaluateDiscoveryInput,
  record: CatalogRecord,
): CheckResult | null {
  const { target, requirement, liveInfo, liveResource, evidence } = input;

  if (record.method !== target.method) {
    return build(
      evidence,
      "FAIL",
      "CATALOG_METHOD_MISMATCH",
      `Catalog record declares method ${record.method} but the live target uses ${target.method}.`,
    );
  }
  if (record.resourceUrl !== target.url) {
    return build(
      evidence,
      "FAIL",
      "CATALOG_URL_MISMATCH",
      `Catalog record declares resource URL ${record.resourceUrl} but the live target is ${target.url}.`,
    );
  }
  const matchingEntry = record.accepts.find(
    (entry) =>
      entry.network === requirement.network &&
      entry.asset === requirement.asset &&
      entry.payTo === requirement.payTo,
  );
  if (matchingEntry === undefined) {
    return build(
      evidence,
      "FAIL",
      "CATALOG_PAYMENT_MISMATCH",
      `Catalog record has no accepted payment entry matching network ${requirement.network}, asset ${requirement.asset} and payTo ${requirement.payTo}.`,
    );
  }
  const catalogMicros = parseAtomicUnits(matchingEntry.amount) ?? 0;
  if (catalogMicros !== requirement.amountMicros) {
    return build(
      evidence,
      "FAIL",
      "CATALOG_PRICE_MISMATCH",
      `Catalog price ${formatMicros(catalogMicros)} does not match the live price ${formatMicros(requirement.amountMicros)}.`,
    );
  }
  if (isSparse(liveInfo, liveResource, record)) {
    return build(
      evidence,
      "WARN",
      "SPARSE_METADATA",
      "Neither the live challenge nor the catalog record declare a description, discovery info and an output example together.",
    );
  }
  return null;
}

function isSparse(
  liveInfo: unknown,
  liveResource: LiveResource | null,
  record: CatalogRecord,
): boolean {
  const hasDescription =
    (liveResource?.description !== undefined && liveResource.description.length > 0) ||
    (record.description !== undefined && record.description.length > 0);
  const hasDiscoveryInfo = liveInfo !== undefined || record.discoveryInfo !== undefined;
  const hasOutputExample =
    outputExamplePresent(liveInfo) || outputExamplePresent(record.discoveryInfo);
  return !hasDescription || !hasDiscoveryInfo || !hasOutputExample;
}

export function evaluateDiscovery(input: EvaluateDiscoveryInput): CheckResult {
  const { target, liveInfo, catalog, evidence } = input;
  const liveMethod = declaredMethod(liveInfo);
  if (liveMethod !== null && liveMethod !== target.method) {
    return build(
      evidence,
      "FAIL",
      "LIVE_METHOD_MISMATCH",
      `Live challenge discovery info declares method ${liveMethod} but the target was called with ${target.method}.`,
    );
  }
  if (catalog.kind === "found") {
    const parsed = catalogRecordSchema.safeParse(catalog.record);
    if (!parsed.success) {
      return build(
        evidence,
        "FAIL",
        "CATALOG_RECORD_MALFORMED",
        `Catalog record failed schema validation: ${parsed.error.message}`,
      );
    }
    const failure = evaluateCatalogRecord(input, parsed.data);
    if (failure !== null) {
      return failure;
    }
    return build(
      evidence,
      "PASS",
      "DISCOVERY_CONSISTENT",
      "Live challenge and catalog record agree on method, URL, payment terms and carry usable metadata.",
    );
  }
  if (catalog.kind === "unavailable") {
    return build(
      evidence,
      "INCONCLUSIVE",
      "CATALOG_UNAVAILABLE",
      "The Bazaar catalog could not be reached to cross-check this resource.",
    );
  }
  return build(
    evidence,
    "WARN",
    "NOT_CATALOGED",
    "The target is not yet listed in the Bazaar catalog.",
  );
}
