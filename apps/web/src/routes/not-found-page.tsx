import { Link } from "react-router";
import { useDocumentTitle } from "../lib/use-document-title";

export function NotFoundPage() {
  useDocumentTitle("Not found · Selo");
  return (
    <div className="relative z-20 mx-auto flex min-h-[70vh] max-w-3xl flex-col justify-center px-6 pt-40">
      <p className="mb-4 font-mono text-xs tracking-widest text-zinc-400">404</p>
      <h1 className="mb-6 font-manrope text-5xl font-medium tracking-tighter text-white">
        Nothing is served here.
      </h1>
      <Link to="/" className="text-sm text-orange-400 transition-colors hover:text-white">
        Back to Selo
      </Link>
    </div>
  );
}
