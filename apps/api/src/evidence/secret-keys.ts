const exactSecretKeys = new Set([
  "authorization",
  "proxyauthorization",
  "cookie",
  "setcookie",
  "xpayment",
  "paymentsignature",
  "sk",
  "sig",
  "accesstoken",
  "refreshtoken",
  "idtoken",
  "apikey",
  "bearer",
]);

const secretKeyFragments = [
  "mnemonic",
  "secret",
  "privatekey",
  "password",
  "passphrase",
  "signature",
];

const snapshotKey = "authorization";

function normalised(key: string): string {
  return key.toLowerCase().replace(/[_-]/g, "");
}

export function isSecretKey(key: string): boolean {
  const name = normalised(key);
  return (
    exactSecretKeys.has(name) || secretKeyFragments.some((fragment) => name.includes(fragment))
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function isAuthorizationSnapshot(key: string, value: unknown): boolean {
  return normalised(key) === snapshotKey && isPlainObject(value);
}
