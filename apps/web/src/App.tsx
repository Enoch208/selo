import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router";
import { SiteShell } from "./components/chrome/site-shell";
import { LandingPage } from "./routes/landing-page";
import { NotFoundPage } from "./routes/not-found-page";

const TestPage = lazy(() => import("./routes/test-page"));
const ReportPage = lazy(() => import("./routes/report-page"));

export function App() {
  return (
    <SiteShell>
      <Suspense fallback={<div className="min-h-screen" />}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/test" element={<TestPage />} />
          <Route path="/r/:token" element={<ReportPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </SiteShell>
  );
}
