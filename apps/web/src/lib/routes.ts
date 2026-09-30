export function testPath(authorizationId?: string): string {
  return authorizationId === undefined
    ? "/test"
    : `/test?authorization=${encodeURIComponent(authorizationId)}`;
}

export function reportPath(token: string): string {
  return `/r/${encodeURIComponent(token)}`;
}

const tokenPattern = /^[A-Za-z0-9_-]{43}$/;

export function reportTokenFrom(input: string): string | null {
  const path = input.trim().replace(/[?#].*$/, "");
  const last =
    path
      .split("/")
      .filter((part) => part !== "")
      .at(-1) ?? "";
  return tokenPattern.test(last) ? last : null;
}
