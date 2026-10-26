export interface GateRun {
  readonly release: string;
  readonly verdict: "FAIL" | "PASS";
  readonly gate: "BLOCK" | "ALLOW";
  readonly exitCode: number;
  readonly jobId: string;
  readonly finding: string;
  readonly detail: string;
  readonly inbound: { readonly txId: string; readonly round: number };
  readonly downstream: { readonly txId: string; readonly round: number };
  readonly githubRun: string;
  readonly githubOutcome: string;
}

export const gateRuns: readonly GateRun[] = [
  {
    release: "broken-v1",
    verdict: "FAIL",
    gate: "BLOCK",
    exitCode: 1,
    jobId: "job_189NZ481HFH77CRGF60AEF22RG",
    finding: "response_contract · SCHEMA_MISMATCH",
    detail: "Health 200, payment settled, response 200, yet the receipt is missing receiptId.",
    inbound: { txId: "SVGTX3U6XQLSGJP7L7X7KNPSDLWFBSA3JK7AFNHPWENIWP4YVIEQ", round: 66348324 },
    downstream: { txId: "RZR6XUIA3GTHW6ABAHUIXRDCNYYXIHQVQYGN2T5PAMDO37DDDOLQ", round: 66348326 },
    githubRun: "https://github.com/Enoch208/selo/actions/runs/40308497965",
    githubOutcome: "Deploy blocked",
  },
  {
    release: "fixed-v2",
    verdict: "PASS",
    gate: "ALLOW",
    exitCode: 0,
    jobId: "job_51AZ2WJZ78RF1WZC316Q1K38GG",
    finding: "All five checks PASS",
    detail:
      "Same URL, paid again: handshake, delivery, contract, Bazaar listing and replay all proven.",
    inbound: { txId: "EPBEZR22SZ5LYKFM7UJYCSFG5IWNA6QYZ6XHUA6KGTTDDQQ5UIJA", round: 66349222 },
    downstream: { txId: "QEUF5D33T4YHYP3KKIY2PGCYF55XXSUYKS5GXFBAVAZ4IEZOE3ZQ", round: 66349225 },
    githubRun: "https://github.com/Enoch208/selo/actions/runs/40308508699",
    githubOutcome: "Deploy allowed",
  },
];

export const gateLinks = {
  action: "https://github.com/Enoch208/selo/blob/main/examples/github-actions/README.md",
  pilot: "https://github.com/Enoch208/selo/blob/main/docs/PILOT_GUIDE.md",
} as const;
