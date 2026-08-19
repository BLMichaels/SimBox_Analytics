import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.warn(
    "SimBox dashboard: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are required.",
  );
}

export const supabase = createClient(url ?? "", anonKey ?? "", {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export function trackingEndpoint(): string {
  if (import.meta.env.VITE_TRACKING_ENDPOINT) {
    return import.meta.env.VITE_TRACKING_ENDPOINT;
  }
  if (!url) return "https://YOUR_PROJECT_REF.supabase.co/functions/v1/record-simbox-event";
  return `${url.replace(/\/$/, "")}/functions/v1/record-simbox-event`;
}
