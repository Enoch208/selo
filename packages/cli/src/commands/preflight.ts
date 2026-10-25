import { requestPreflight } from "../api";
import { exitCodes, type ExitCode } from "../exit";
import { loadBody } from "../files";
import { apiOrigin, id, method, optionalText, targetUrl } from "../options";
import type { CommandContext } from "./auth";
import { parseOptions } from "./parse";

export async function preflightCommand(
  ctx: CommandContext,
  args: readonly string[],
): Promise<ExitCode> {
  const values = parseOptions(args, {
    api: { type: "string" },
    authorization: { type: "string" },
    url: { type: "string" },
    method: { type: "string" },
    body: { type: "string" },
  });
  const bodyFile = optionalText(values, "body");
  const answer = await requestPreflight(ctx.fetch, apiOrigin(values), {
    authorizationId: id(values, "authorization"),
    targetUrl: targetUrl(values),
    method: method(values),
    ...(bodyFile === null ? {} : { requestBody: await loadBody(bodyFile) }),
  });
  if (answer.kind === "refused" || answer.kind === "unavailable") {
    ctx.out.error(answer.message);
    return answer.kind === "refused" ? exitCodes.refused : exitCodes.inconclusive;
  }
  if (answer.kind === "ineligible") {
    ctx.out.error(`ineligible (${answer.preflight.reason}): ${answer.preflight.message}`);
    return exitCodes.refused;
  }
  const { preflight } = answer;
  ctx.out.line(`preflight  ${preflight.preflightId}: eligible until ${preflight.expiresAt}`);
  ctx.out.line(`target     ${preflight.target.method} ${preflight.target.url}`);
  ctx.out.line(`target fee ${preflight.target.priceUsdc} USDC, paid by Selo`);
  ctx.out.line(`Selo cap   ${preflight.estimatedMaxSpendUsdc} USDC at most spent on the target`);
  ctx.out.line(`you pay    ${preflight.seloPriceUsdc} USDC to Selo for the release test`);
  return exitCodes.pass;
}
