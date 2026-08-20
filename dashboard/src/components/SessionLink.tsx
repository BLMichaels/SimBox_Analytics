import { Link } from "react-router-dom";
import { shortSession } from "../lib/dates";

export function SessionLink({ sessionId }: { sessionId: string }) {
  return (
    <Link
      to={`/sessions/${encodeURIComponent(sessionId)}`}
      className="font-mono text-xs text-teal-deep underline-offset-2 hover:underline"
      onClick={(e) => e.stopPropagation()}
      title={`Open session ${sessionId}`}
    >
      {shortSession(sessionId)}
    </Link>
  );
}
