import { supabase } from "./supabase";

// Lead Engine lives in the `streamline_hq` schema (exposed to the API).
// Usage: hq().from("prospects").select(...)
export const hq = () => supabase.schema("streamline_hq");
