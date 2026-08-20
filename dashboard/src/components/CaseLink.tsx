import { Link } from "react-router-dom";
import type { SessionSummary } from "../lib/reporting";
import { outcomeLabel } from "../lib/reporting";

export function OutcomeBadge({ outcome }: { outcome: SessionSummary["outcome"] }) {
  return <span className={`outcome-pill outcome-${outcome}`}>{outcomeLabel(outcome)}</span>;
}

export function CaseLink({ caseKey, children }: { caseKey: string; children: string }) {
  if (!caseKey) return <>{children}</>;
  return (
    <Link
      to={`/cases/${encodeURIComponent(caseKey)}`}
      className="text-teal-deep underline-offset-2 hover:underline"
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </Link>
  );
}
