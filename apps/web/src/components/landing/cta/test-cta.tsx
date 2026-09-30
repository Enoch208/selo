import type { AuthorizationChallengeView } from "@selo/core";
import { ArrowRight } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { AuthorizationForm } from "../../authorize/authorization-form";
import { ChallengeCard } from "../../authorize/challenge-card";
import { testPath } from "../../../lib/routes";
import { primaryButtonClass } from "../../ui/primary-button";

export function TestCta() {
  const [challenge, setChallenge] = useState<AuthorizationChallengeView | null>(null);
  return (
    <section
      id="test"
      aria-labelledby="test-title"
      className="relative z-20 mx-auto mb-32 mt-32 w-full max-w-7xl scroll-mt-28 px-6"
    >
      <div className="grid items-start gap-16 lg:grid-cols-12">
        <div className="pt-4 lg:col-span-5">
          <h2
            id="test-title"
            className="mb-6 font-manrope text-5xl font-medium leading-[1.1] tracking-tighter text-white md:text-6xl"
          >
            Test your{" "}
            <span className="bg-gradient-to-r from-orange-400 to-orange-600 bg-clip-text text-transparent">
              endpoint.
            </span>
          </h2>
          <p className="max-w-md font-sans text-lg leading-relaxed text-zinc-400">
            Start with the route you own. Selo issues a one-time token to serve from your origin;
            once it is live, verify it, run a free preflight and see the price before you pay
            anything.
          </p>
        </div>
        <div className="lg:col-span-7" aria-live="polite">
          {challenge === null ? (
            <AuthorizationForm idPrefix="cta" onCreated={setChallenge} />
          ) : (
            <div className="space-y-8">
              <ChallengeCard challenge={challenge} />
              <div className="flex flex-wrap items-center justify-end gap-6">
                <button
                  type="button"
                  onClick={() => {
                    setChallenge(null);
                  }}
                  className="text-xs uppercase tracking-wider text-zinc-400 transition-colors hover:text-white"
                >
                  Start over
                </button>
                <Link
                  to={testPath(challenge.authorizationId)}
                  state={{ challenge }}
                  className={primaryButtonClass}
                >
                  Continue the test
                  <ArrowRight
                    aria-hidden="true"
                    className="size-4 transition-transform group-hover:translate-x-0.5"
                  />
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
