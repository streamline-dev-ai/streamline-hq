import { useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { Radio } from "lucide-react";

/**
 * AuthGate — gates the entire HQ app behind a Supabase Auth session.
 *
 * The internal tables (leads, invoices, clients, prospects, …) are protected by
 * RLS that only allows the `authenticated` role. The public anon key can no
 * longer read them, so the app must sign in first. Sessions are persisted
 * (see src/lib/supabase.ts: persistSession + autoRefreshToken), so you stay
 * logged in across reloads and only re-enter your password if you sign out or
 * the refresh token finally expires.
 */
export default function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!ready) {
    return (
      <div className="grid min-h-dvh place-items-center bg-base text-ink-faint">
        <div className="text-sm">Loading…</div>
      </div>
    );
  }

  if (!session) return <LoginForm />;
  return <>{children}</>;
}

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setBusy(false);
    if (error) setError(error.message);
    // On success, onAuthStateChange in AuthGate swaps in the app automatically.
  }

  return (
    <div className="grid min-h-dvh place-items-center bg-base px-4 text-ink">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-2xl border border-line bg-panel/60 p-6 shadow-xl"
      >
        <div className="mb-6 flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-soft text-brand">
            <Radio className="h-5 w-5" />
          </div>
          <div>
            <div className="text-sm font-bold leading-none">Streamline HQ</div>
            <div className="mt-1 text-xs text-ink-faint">Sign in to continue</div>
          </div>
        </div>

        <label className="mb-1 block text-xs font-medium text-ink-muted">Email</label>
        <input
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mb-4 w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand"
        />

        <label className="mb-1 block text-xs font-medium text-ink-muted">Password</label>
        <input
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mb-4 w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand"
        />

        {error && (
          <div className="mb-4 rounded-xl border border-accent/40 bg-accent/10 px-3 py-2 text-xs text-accent">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-xl bg-brand px-3 py-2.5 text-sm font-semibold text-white transition active:scale-[0.99] disabled:opacity-60"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}

export async function signOut() {
  await supabase.auth.signOut();
}
