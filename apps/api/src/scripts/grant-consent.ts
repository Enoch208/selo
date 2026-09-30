import { parseArgs } from "node:util";
import { grantConsent, type ConsentOutcome } from "../authorizations/consent";
import { createDb } from "../db/client";
import { loadConsentEnv } from "../env";

const usage =
  'Usage: consent:grant -- --url <https url> --method GET|POST --project <name> --contact <contact> --note "<how the owner consented>"';

const options = {
  url: { type: "string" },
  method: { type: "string" },
  project: { type: "string" },
  contact: { type: "string" },
  note: { type: "string" },
} as const;

const isParseArgsError = (error: unknown): boolean =>
  error instanceof TypeError &&
  "code" in error &&
  typeof error.code === "string" &&
  error.code.startsWith("ERR_PARSE_ARGS_");

function readArgs(argv: readonly string[]) {
  const args = argv.filter((arg, index) => !(index === 0 && arg === "--"));
  try {
    return parseArgs({ args, strict: true, options }).values;
  } catch (error: unknown) {
    if (isParseArgsError(error)) {
      return null;
    }
    throw error;
  }
}

function refuse(message: string): void {
  process.stderr.write(`${message}\n${usage}\n`);
  process.exitCode = 1;
}

function report(outcome: ConsentOutcome): void {
  if (outcome.ok) {
    process.stdout.write(`${outcome.authorization.authorizationId}\n`);
  } else {
    refuse(outcome.message);
  }
}

const values = readArgs(process.argv.slice(2));
if (values === null) {
  refuse("Unrecognised or incomplete arguments");
} else {
  const env = loadConsentEnv(process.env);
  const db = createDb(env.DATABASE_URL);
  try {
    const input = {
      targetUrl: values.url,
      method: values.method,
      project: values.project,
      contact: values.contact,
      note: values.note,
    };
    report(await grantConsent(db, input, env.AUTHORIZATION_TTL_HOURS));
  } finally {
    await db.$client.end();
  }
}
