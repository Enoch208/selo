import type { AuthorizationView } from "@selo/core";
import { createAuthorization, readAuthorization, verifyAuthorization, type Free } from "../api";
import { exitCodes, type ExitCode, type Output } from "../exit";
import type { CliFetch } from "../http";
import { apiOrigin, id, method, targetUrl, text, UsageError } from "../options";
import { parseOptions } from "./parse";

export interface CommandContext {
  readonly fetch: CliFetch;
  readonly out: Output;
}

function failed<T>(out: Output, answer: Exclude<Free<T>, { kind: "ok" }>): ExitCode {
  out.error(answer.message);
  return answer.kind === "refused" ? exitCodes.refused : exitCodes.inconclusive;
}

function printAuthorization(out: Output, view: AuthorizationView): ExitCode {
  out.line(`authorization ${view.authorizationId}: ${view.status}`);
  out.line(`covers        ${view.method} ${view.origin}${view.routePath} (${view.type})`);
  out.line(`expires       ${view.expiresAt ?? "never set"}`);
  return view.status === "VERIFIED" ? exitCodes.pass : exitCodes.refused;
}

async function create(ctx: CommandContext, args: readonly string[]): Promise<ExitCode> {
  const values = parseOptions(args, {
    api: { type: "string" },
    url: { type: "string" },
    method: { type: "string" },
    project: { type: "string" },
    contact: { type: "string" },
  });
  const api = apiOrigin(values);
  const answer = await createAuthorization(ctx.fetch, api, {
    targetUrl: targetUrl(values),
    method: method(values),
    project: text(values, "project"),
    contact: text(values, "contact"),
  });
  if (answer.kind !== "ok") {
    return failed(ctx.out, answer);
  }
  const challenge = answer.value;
  ctx.out.line(`authorization ${challenge.authorizationId}: ${challenge.status}`);
  ctx.out.line(`serve this line at ${challenge.verificationUrl}:`);
  ctx.out.line(challenge.expectedContent);
  ctx.out.line(
    `then run: selo auth verify --api ${api} --authorization ${challenge.authorizationId}`,
  );
  return exitCodes.pass;
}

async function verify(ctx: CommandContext, args: readonly string[]): Promise<ExitCode> {
  const values = parseOptions(args, { api: { type: "string" }, authorization: { type: "string" } });
  const answer = await verifyAuthorization(
    ctx.fetch,
    apiOrigin(values),
    id(values, "authorization"),
  );
  return answer.kind === "ok" ? printAuthorization(ctx.out, answer.value) : failed(ctx.out, answer);
}

async function status(ctx: CommandContext, args: readonly string[]): Promise<ExitCode> {
  const values = parseOptions(args, { api: { type: "string" }, authorization: { type: "string" } });
  const answer = await readAuthorization(ctx.fetch, apiOrigin(values), id(values, "authorization"));
  return answer.kind === "ok" ? printAuthorization(ctx.out, answer.value) : failed(ctx.out, answer);
}

export function authCommand(
  ctx: CommandContext,
  sub: string | undefined,
  args: readonly string[],
): Promise<ExitCode> {
  if (sub === "create") {
    return create(ctx, args);
  }
  if (sub === "verify") {
    return verify(ctx, args);
  }
  if (sub === "status") {
    return status(ctx, args);
  }
  throw new UsageError("selo auth needs create, verify or status");
}
