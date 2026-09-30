import { resolve } from "node:path";
import { parseArgs, type ParseArgsOptionsConfig } from "node:util";

const isParseArgsError = (error: unknown): boolean =>
  error instanceof TypeError &&
  "code" in error &&
  typeof error.code === "string" &&
  error.code.startsWith("ERR_PARSE_ARGS_");

export function parseCli<const T extends ParseArgsOptionsConfig>(options: T) {
  const args = process.argv.slice(2).filter((arg, index) => !(index === 0 && arg === "--"));
  try {
    return parseArgs({ args, options, strict: true, allowPositionals: false }).values;
  } catch (error: unknown) {
    if (isParseArgsError(error)) {
      return null;
    }
    throw error;
  }
}

export function say(line: string): void {
  process.stdout.write(`${line}\n`);
}

export function fail(message: string, usage?: string): void {
  process.stderr.write(`${message}\n${usage === undefined ? "" : `${usage}\n`}`);
  process.exitCode = 1;
}

export function fromInvocationDir(path: string): string {
  return resolve(process.env.INIT_CWD ?? process.cwd(), path);
}
