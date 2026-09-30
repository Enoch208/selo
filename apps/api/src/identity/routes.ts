import { Hono } from "hono";
import { agentCard, homepageHtml, llmsText, type IdentityConfig } from "./content";

export function identityRoutes(config: IdentityConfig) {
  return new Hono()
    .get("/", (c) => c.html(homepageHtml(config)))
    .get("/llms.txt", (c) => c.text(llmsText(config)))
    .get("/.well-known/agent-card.json", (c) => c.json(agentCard(config)));
}
