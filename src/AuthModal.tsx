import { useState } from "react";
import type { User } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "./supabaseClient";

export interface LocalUser {
  username: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  user: User | null;
  localUser: LocalUser | null;
  onLocalSignIn: (username: string) => void;
  onLocalSignOut: () => void;
  onOpenProjects?: () => void;
  onOpenGitHubImport?: () => void;
}

export function AuthModal({
  open,
  onClose,
  user,
  localUser,
  onLocalSignIn,
  onLocalSignOut,
  onOpenProjects,
  onOpenGitHubImport,
}: Props) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [localHandle, setLocalHandle] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "err" | "ok"; text: string } | null>(null);

  if (!open) return null;

  const activeUserName =
    (user?.user_metadata?.user_name as string | undefined) ||
    user?.email ||
    localUser?.username ||
    null;

  const avatarUrl = user?.user_metadata?.avatar_url as string | undefined;

  const handleGitHub = async () => {
    if (!supabase) return;
    setMsg(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "github",
      options: {
        redirectTo: window.location.origin + window.location.pathname,
        scopes: "read:user repo",
      },
    });
    if (error) setMsg({ kind: "err", text: error.message });
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setMsg(null);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        onClose();
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setMsg({ kind: "ok", text: "Account created! Check your inbox to confirm your email." });
      }
    } catch (err) {
      setMsg({ kind: "err", text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const handleSignOut = async () => {
    if (supabase && user) await supabase.auth.signOut();
    onLocalSignOut();
    onClose();
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 110,
        background: "var(--cs-backdrop)", backdropFilter: "blur(6px)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(440px, 100%)",
          background: "var(--cs-surface)", border: "1px solid var(--cs-border-strong)", borderRadius: 14,
          padding: 24, boxShadow: "var(--cs-shadow)",
          display: "flex", flexDirection: "column", gap: 16,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, color: "var(--cs-text-heading)" }}>
              {activeUserName ? "Your Account" : "Sign in to Charm Studio"}
            </h2>
            <div style={{ fontSize: 12, color: "var(--cs-text-dim)", marginTop: 3 }}>
              {activeUserName
                ? "Signed in — your projects and layouts are linked to your profile."
                : "Save named TUI layouts, manage themes, and sync across devices."}
            </div>
          </div>
          <button onClick={onClose} style={btn}>✕</button>
        </div>

        {msg && (
          <div
            style={{
              padding: "9px 12px", borderRadius: 8, fontSize: 12,
              background: msg.kind === "err" ? "rgba(244, 63, 94, 0.14)" : "var(--cs-mint-bg)",
              border: `1px solid ${msg.kind === "err" ? "rgba(244, 63, 94, 0.45)" : "var(--cs-mint-border)"}`,
              color: msg.kind === "err" ? "#e11d48" : "var(--cs-mint)",
            }}
          >
            {msg.text}
          </div>
        )}

        {activeUserName ? (
          <div style={card}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
              {avatarUrl ? (
                <img src={avatarUrl} alt="" style={{ width: 40, height: 40, borderRadius: "50%", border: "1px solid var(--cs-pink)" }} />
              ) : (
                <div style={{ width: 40, height: 40, borderRadius: "50%", background: "var(--cs-pink-bg)", border: "1px solid var(--cs-pink)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: "var(--cs-pink-soft)" }}>
                  {activeUserName[0]?.toUpperCase()}
                </div>
              )}
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: "var(--cs-text-strong)" }}>@{activeUserName}</div>
                <div style={{ fontSize: 11.5, color: user ? "var(--cs-mint)" : "var(--cs-lavender-text)" }}>
                  {user ? "● Cloud Sync Active (Supabase)" : "● Local Browser Profile"}
                </div>
              </div>
            </div>

            <div style={{ fontSize: 11.5, color: "var(--cs-text-muted)", lineHeight: 1.5, marginBottom: 12, padding: "8px 10px", borderRadius: 8, background: "var(--cs-panel)", border: "1px solid var(--cs-border)" }}>
              <div><b style={{ color: "var(--cs-mint)" }}>1. Cloud Sync:</b> Save studio layouts &amp; create <code style={code}>?p=</code> share links in <b>Projects</b>.</div>
              <div><b style={{ color: "var(--cs-pink-soft)" }}>2. GitHub Repos:</b> Browse &amp; import your existing <code style={code}>.go</code> files in <b>Import / GitHub</b>.</div>
            </div>

            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              {onOpenGitHubImport && (
                <button
                  onClick={() => {
                    onClose();
                    onOpenGitHubImport();
                  }}
                  style={{ ...primaryBtn, flex: 1 }}
                >
                  📥 My GitHub Repos
                </button>
              )}
              {onOpenProjects && (
                <button
                  onClick={() => {
                    onClose();
                    onOpenProjects();
                  }}
                  style={{ ...btn, flex: 1 }}
                >
                  📁 Saved Projects
                </button>
              )}
            </div>

            <button onClick={handleSignOut} style={{ ...btn, width: "100%", color: "#e11d48" }}>
              Sign Out
            </button>
          </div>
        ) : isSupabaseConfigured ? (
          <>
            <div style={{ fontSize: 11.5, color: "var(--cs-text-muted)", lineHeight: 1.5, padding: "8px 10px", borderRadius: 8, background: "var(--cs-card)", border: "1px solid var(--cs-border-subtle)" }}>
              Signing in with GitHub unlocks <b style={{ color: "var(--cs-mint)" }}>Cloud Project Sync</b> across devices and lists <b style={{ color: "var(--cs-pink-soft)" }}>your GitHub repos</b> directly inside Import.
            </div>
            <button onClick={handleGitHub} style={{ ...primaryBtn, padding: "10px 14px", fontSize: 13 }}>
              Continue with GitHub
            </button>

            <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--cs-text-dim)", fontSize: 11 }}>
              <div style={{ flex: 1, height: 1, background: "var(--cs-border)" }} />
              <span>or with email</span>
              <div style={{ flex: 1, height: 1, background: "var(--cs-border)" }} />
            </div>

            <form onSubmit={handleEmailAuth} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <label style={lbl}>
                Email
                <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" style={inp} />
              </label>
              <label style={lbl}>
                Password
                <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" style={inp} />
              </label>
              <button type="submit" disabled={busy} style={btn}>
                {busy ? "Working..." : mode === "signin" ? "Sign In with Email" : "Create Account"}
              </button>
            </form>

            <button
              onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setMsg(null); }}
              style={{ background: "none", border: "none", color: "var(--cs-lavender-text)", fontSize: 12, cursor: "pointer", textAlign: "center" }}
            >
              {mode === "signin" ? "Need an account? Create one →" : "Already have an account? Sign in →"}
            </button>
          </>
        ) : (
          <div style={card}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--cs-mint)", marginBottom: 4 }}>
              Quick Local Sign-In
            </div>
            <div style={{ fontSize: 11.5, color: "var(--cs-text-dim)", lineHeight: 1.45, marginBottom: 10 }}>
              Pick a handle to personalize this browser session and save projects locally. (Add Supabase keys in <code style={code}>web/.env.local</code> anytime to enable GitHub &amp; Email cloud login.)
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!localHandle.trim()) return;
                onLocalSignIn(localHandle.trim().replace(/^@/, ""));
                setLocalHandle("");
                onClose();
              }}
              style={{ display: "flex", gap: 8 }}
            >
              <input
                value={localHandle}
                onChange={(e) => setLocalHandle(e.target.value)}
                placeholder="@yourhandle"
                style={{ ...inp, flex: 1 }}
              />
              <button type="submit" style={primaryBtn}>Sign In</button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

const code: React.CSSProperties = { fontFamily: "ui-monospace, monospace", fontSize: 11, padding: "1px 5px", borderRadius: 4, background: "var(--cs-input)", color: "var(--cs-text-heading)", border: "1px solid var(--cs-border)" };
const card: React.CSSProperties = { background: "var(--cs-card)", border: "1px solid var(--cs-border-subtle)", borderRadius: 10, padding: 14 };
const lbl: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "var(--cs-text-body)" };
const inp: React.CSSProperties = { background: "var(--cs-input)", color: "var(--cs-text)", border: "1px solid var(--cs-btn-border)", borderRadius: 6, padding: "7px 9px", fontSize: 12, width: "100%" };
const btn: React.CSSProperties = { background: "var(--cs-btn-bg)", color: "var(--cs-btn-text)", border: "1px solid var(--cs-btn-border)", borderRadius: 6, padding: "7px 12px", fontSize: 12, cursor: "pointer" };
const primaryBtn: React.CSSProperties = { background: "var(--cs-pink-bg)", color: "var(--cs-pink-soft)", border: "1px solid var(--cs-pink)", borderRadius: 6, padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer" };
