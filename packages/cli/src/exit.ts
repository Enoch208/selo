export const exitCodes = {
  pass: 0,
  fail: 1,
  inconclusive: 2,
  refused: 3,
} as const;

export type ExitCode = (typeof exitCodes)[keyof typeof exitCodes];

export interface Output {
  readonly line: (text: string) => void;
  readonly error: (text: string) => void;
}

export const processOutput: Output = {
  line: (text) => process.stdout.write(`${text}\n`),
  error: (text) => process.stderr.write(`${text}\n`),
};
