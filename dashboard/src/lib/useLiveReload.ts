import { useEffect } from "react";
import { supabase } from "./supabase";

/** Reload dashboard data as soon as new anonymous events arrive. */
export function useLiveReload(reload: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const interval = window.setInterval(reload, 30000);
    const channel = supabase
      .channel("case_events_live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "case_events" },
        () => {
          reload();
        },
      )
      .subscribe();
    return () => {
      window.clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, [enabled, reload]);
}
