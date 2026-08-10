import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

const ALLOWED = new Set(["signup", "login"]);

/** Safe back link when legal pages are opened from auth flows (?from=signup|login). */
export function LegalAuthBackLink() {
  const [params] = useSearchParams();
  const from = (params.get("from") ?? "").toLowerCase();
  if (!ALLOWED.has(from)) return null;

  const href = from === "signup" ? "/signup" : "/login";
  const label = from === "signup" ? "Back to signup" : "Back to login";

  return (
    <Link
      to={href}
      className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline mb-6"
    >
      <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
      {label}
    </Link>
  );
}
