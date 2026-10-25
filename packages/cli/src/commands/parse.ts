import { parseArgs, type ParseArgsOptionsConfig } from "node:util";
import { UsageError } from "../options";

const isParseArgsError = (error: unknown): error is Error =>
  error instanceof TypeError &&
  "code" in error &&
  typeof error.code === "string" &&
  error.code.startsWith("ERR_PARSE_ARGS_");

export function parseOptions<const T extends ParseArgsOptionsConfig>(
  args: readonly string[],
  options: T,
) {
  try {
    return parseArgs({ args: [...args], options, strict: true, allowPositionals: false }).values;
  } catch (error: unknown) {
    if (isParseArgsError(error)) {
      throw new UsageError(error.message);
    }
    throw error;
  }
}
