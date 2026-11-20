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
}

export function AuthModal({
  open,
  onClose,
  user,
  localUser,
  onLocalSignIn,
  onLocalSignOut,
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
      options: { redirectTo: window.location.origin + window.location.pathname },
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
        background: "rgba(8, 7, 14, 0.76)", backdropFilter: "blur(6px)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(440px, 100%)",
          background: "#13111d", border: "1px solid #382f57", borderRadius: 14,
          padding: 24, boxShadow: "0 24px 60px rgba(0,0,0,0.65)",
          display: "flex", flexDirection: "column", gap: 16,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, color: "#f5d0fe" }}>
              {activeUserName ? "Your Account" : "Sign in to Charm Studio"}
            </h2>
            <div style={{ fontSize: 12, color: "#8b82ad", marginTop: 3 }}>
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
              background: msg.kind === "err" ? "rgba(244, 63, 94, 0.16)" : "rgba(94, 234, 212, 0.14)",
              border: `1px solid ${msg.kind === "err" ? "rgba(244, 63, 94, 0.45)" : "rgba(94, 234, 212, 0.45)"}`,
              color: msg.kind === "err" ? "#fda4af" : "#5eead4",
            }}
          >
            {msg.text}
          </div>
        )}

        {activeUserName ? (
          <div style={card}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
              {avatarUrl ? (
                <img src={avatarUrl} alt="" style={{ width: 40, height: 40, borderRadius: "50%", border: "1px solid #ff75b5" }} />
              ) : (
                <div style={{ width: 40, height: 40, borderRadius: "50%", background: "rgba(255,117,181,0.2)", border: "1px solid #ff75b5", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: "#ff99c8" }}>
                  {activeUserName[0]?.toUpperCase()}
                </div>
              )}
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: "#fdf4ff" }}>@{activeUserName}</div>
                <div style={{ fontSize: 11.5, color: user ? "#5eead4" : "#c4b5fd" }}>
                  {user ? "● Cloud Sync Active (Supabase)" : "● Local Browser Profile"}
                </div>
              </div>
            </div>
            <button onClick={handleSignOut} style={{ ...btn, width: "100%", color: "#fda4af" }}>
              Sign Out
            </button>
          </div>
        ) : isSupabaseConfigured ? (
          <>
            <button onClick={handleGitHub} style={{ ...primaryBtn, padding: "10px 14px", fontSize: 13 }}>
              Continue with GitHub
            </button>

            <div style={{ display: "flex", alignItems: "center", gap: 10, color: "#7e769e", fontSize: 11 }}>
              <div style={{ flex: 1, height: 1, background: "#26213a" }} />
              <span>or with email</span>
              <div style={{ flex: 1, height: 1, background: "#26213a" }} />
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
              style={{ background: "none", border: "none", color: "#c4b5fd", fontSize: 12, cursor: "pointer", textAlign: "center" }}
            >
              {mode === "signin" ? "Need an account? Create one →" : "Already have an account? Sign in →"}
            </button>
          </>
        ) : (
          <div style={card}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#5eead4", marginBottom: 4 }}>
              Quick Local Sign-In
            </div>
            <div style={{ fontSize: 11.5, color: "#8b82ad", lineHeight: 1.45, marginBottom: 10 }}>
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

const code: React.CSSProperties = { fontFamily: "ui-monospace, monospace", fontSize: 11, padding: "1px 5px", borderRadius: 4, background: "#0c0b12", color: "#f5d0fe" };
const card: React.CSSProperties = { background: "#181526", border: "1px solid #2b2442", borderRadius: 10, padding: 14 };
const lbl: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "#d8cff5" };
const inp: React.CSSProperties = { background: "#0c0b12", color: "#ede9fe", border: "1px solid #322b4d", borderRadius: 6, padding: "7px 9px", fontSize: 12, width: "100%" };
const btn: React.CSSProperties = { background: "#1b1729", color: "#ddd6fe", border: "1px solid #322b4d", borderRadius: 6, padding: "7px 12px", fontSize: 12, cursor: "pointer" };
const primaryBtn: React.CSSProperties = { background: "rgba(255, 117, 181, 0.22)", color: "#ff99c8", border: "1px solid #ff75b5", borderRadius: 6, padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer" };
