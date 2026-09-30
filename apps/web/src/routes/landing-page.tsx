import { Checks } from "../components/landing/checks/checks";
import { TestCta } from "../components/landing/cta/test-cta";
import { Hero } from "../components/landing/hero/hero";
import { HowItWorks } from "../components/landing/how-it-works/how-it-works";
import { Proof } from "../components/landing/proof/proof";
import { useDocumentTitle } from "../lib/use-document-title";
import { useLandingMotion } from "../lib/use-landing-motion";

export function LandingPage() {
  useDocumentTitle("Selo · CI for x402");
  useLandingMotion();
  return (
    <>
      <Hero />
      <HowItWorks />
      <Checks />
      <Proof />
      <TestCta />
    </>
  );
}
