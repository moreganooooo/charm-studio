import { useState } from "react";
import type { User } from "@supabase/supabase-js";
import { Check, Cloud, Globe, Lock, Trash2, X } from "lucide-react";
import type { StudioProject } from "./projectsStore";
import { isSupabaseConfigured, supabase } from "./supabaseClient";

interface Props {
  open: boolean;
  onClose: () => void;
  user: User | null;
  projects: StudioProject[];
  activeProjectId: string | null;
  busy: boolean;
  onSaveNew: (name: string) => Promise<void>;
  onSaveOverwrite: () => Promise<void>;
  onLoadProject: (proj: StudioProject) => void;
  onTogglePublic: (proj: StudioProject) => Promise<void>;
  onDeleteProject: (proj: StudioProject) => Promise<void>;
}

export function ProjectsModal({
  open,
  onClose,
  user,
  projects,
  activeProjectId,
  busy,
  onSaveNew,
  onSaveOverwrite,
  onLoadProject,
  onTogglePublic,
  onDeleteProject,
}: Props) {
  const [newName, setNewName] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [authMsg, setAuthMsg] = useState<string | null>(null);

  if (!open) return null;

  const activeProj = projects.find((p) => p.id === activeProjectId) ?? null;

  const signInWithGitHub = async () => {
    if (!supabase) return;
    setAuthMsg(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "github",
      options: {
        redirectTo: window.location.origin + window.location.pathname,
        scopes: "read:user repo",
      },
    });
    if (error) setAuthMsg(error.message);
  };

  const signOut = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
  };

  const copyCloudLink = async (id: string) => {
    const url = `${window.location.origin}${window.location.pathname}?p=${id}`;
    await navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1600);
  };

  const avatarUrl = user?.user_metadata?.avatar_url as string | undefined;
  const userName = (user?.user_metadata?.user_name || user?.email || "Account") as string;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        background: "var(--cs-backdrop)", backdropFilter: "blur(6px)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(660px, 100%)", maxHeight: "88vh", overflowY: "auto",
          background: "var(--cs-surface)", border: "1px solid var(--cs-border-strong)", borderRadius: 14,
          padding: 22, boxShadow: "var(--cs-shadow)",
          display: "flex", flexDirection: "column", gap: 16,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, color: "var(--cs-text-heading)" }}>Saved Projects &amp; Cloud Sync</h2>
            <div style={{ fontSize: 12, color: "var(--cs-text-dim)", marginTop: 3 }}>
              Save multiple layouts locally right away, or sign in with GitHub to sync across devices.
            </div>
          </div>
          <button onClick={onClose} style={{ ...btn, display: "inline-flex", alignItems: "center", justifyContent: "center" }} aria-label="Close">
            <X size={15} />
          </button>
        </div>

        <div style={card}>
          {!isSupabaseConfigured ? (
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--cs-mint)" }}>Local Library Active</div>
              <div style={{ fontSize: 11.5, color: "var(--cs-text-dim)", marginTop: 2 }}>
                Projects save in this browser’s storage. Add <code style={code}>VITE_SUPABASE_URL</code> &amp;{" "}
                <code style={code}>VITE_SUPABASE_ANON_KEY</code> to <code style={code}>.env.local</code> to unlock GitHub Cloud Sync.
              </div>
            </div>
          ) : user ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {avatarUrl && <img src={avatarUrl} alt="" style={{ width: 32, height: 32, borderRadius: "50%", border: "1px solid var(--cs-pink)" }} />}
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--cs-text-strong)" }}>
                    @{userName} <span style={{ fontSize: 11, color: "var(--cs-mint)", marginLeft: 6 }}>● Cloud Sync Active</span>
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--cs-text-dim)" }}>Your saved layouts sync automatically to your account.</div>
                </div>
              </div>
              <button onClick={signOut} style={btn}>Sign Out</button>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--cs-text-heading)" }}>Sync Projects in the Cloud</div>
                <div style={{ fontSize: 11.5, color: "var(--cs-text-dim)", marginTop: 2 }}>
                  Sign in with GitHub to back up layouts and create short public share links.
                </div>
              </div>
              <button onClick={signInWithGitHub} style={primaryBtn}>Sign in with GitHub</button>
            </div>
          )}
          {authMsg && <div style={{ marginTop: 8, fontSize: 12, color: "#e11d48" }}>{authMsg}</div>}
        </div>

        <div style={card}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--cs-text-heading)", marginBottom: 8 }}>
            Save Current Canvas
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. K8s Cluster Monitor"
              style={{ ...inp, flex: 1, minWidth: 180 }}
            />
            <button
              disabled={busy || !newName.trim()}
              onClick={async () => {
                await onSaveNew(newName.trim());
                setNewName("");
              }}
              style={primaryBtn}
            >
              {busy ? "Saving..." : "+ Save as New"}
            </button>
            {activeProj && (
              <button disabled={busy} onClick={onSaveOverwrite} style={btn}>
                Update “{activeProj.name}”
              </button>
            )}
          </div>
        </div>

        <div style={card}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--cs-text-heading)", marginBottom: 10 }}>
            Your Projects ({projects.length})
          </div>
          {projects.length === 0 ? (
            <div style={{ fontSize: 12, color: "var(--cs-text-dim)", padding: "12px 0" }}>
              No saved projects yet—give your current layout a name above to save it!
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {projects.map((p) => {
                const isActive = p.id === activeProjectId;
                return (
                  <div
                    key={p.id}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
                      padding: "10px 12px", borderRadius: 8,
                      background: isActive ? "var(--cs-pink-bg)" : "var(--cs-panel)",
                      border: `1px solid ${isActive ? "var(--cs-pink)" : "var(--cs-border)"}`,
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ minWidth: 150, flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: "var(--cs-text-strong)" }}>
                        <span>{p.name}</span>
                        <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 999, background: "var(--cs-input)", color: p.source === "cloud" ? "var(--cs-mint)" : "var(--cs-lavender-text)", border: "1px solid var(--cs-border-subtle)", display: "inline-flex", alignItems: "center", gap: 4 }}>
                          {p.source === "cloud" ? <><Cloud size={11} /> <span>Cloud</span></> : "Local"}
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: "var(--cs-text-dim)", marginTop: 2 }}>
                        Updated {new Date(p.updatedAt).toLocaleString()}
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      {p.source === "cloud" && (
                        <>
                          <button
                            onClick={() => onTogglePublic(p)}
                            title="Toggle public short-link visibility"
                            style={{ ...btn, fontSize: 11, color: p.isPublic ? "var(--cs-mint)" : "var(--cs-text-muted)", display: "inline-flex", alignItems: "center", gap: 5 }}
                          >
                            {p.isPublic ? <><Globe size={12} /> <span>Public</span></> : <><Lock size={12} /> <span>Private</span></>}
                          </button>
                          {p.isPublic && (
                            <button onClick={() => copyCloudLink(p.id)} style={{ ...btn, fontSize: 11, display: "inline-flex", alignItems: "center", gap: 4 }}>
                              {copiedId === p.id ? <><Check size={12} /> <span>Copied</span></> : "Copy ?p= Link"}
                            </button>
                          )}
                        </>
                      )}
                      <button
                        onClick={() => {
                          onLoadProject(p);
                          onClose();
                        }}
                        style={primaryBtn}
                      >
                        Load
                      </button>
                      <button onClick={() => onDeleteProject(p)} style={{ ...btn, color: "#e11d48", display: "inline-flex", alignItems: "center", justifyContent: "center" }} title="Delete project">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const code: React.CSSProperties = { fontFamily: "ui-monospace, monospace", fontSize: 11, padding: "1px 5px", borderRadius: 4, background: "var(--cs-input)", color: "var(--cs-text-heading)", border: "1px solid var(--cs-border)" };
const card: React.CSSProperties = { background: "var(--cs-card)", border: "1px solid var(--cs-border-subtle)", borderRadius: 10, padding: 14 };
const inp: React.CSSProperties = { background: "var(--cs-input)", color: "var(--cs-text)", border: "1px solid var(--cs-btn-border)", borderRadius: 6, padding: "6px 8px", fontSize: 12 };
const btn: React.CSSProperties = { background: "var(--cs-btn-bg)", color: "var(--cs-btn-text)", border: "1px solid var(--cs-btn-border)", borderRadius: 6, padding: "6px 10px", fontSize: 12, cursor: "pointer" };
const primaryBtn: React.CSSProperties = { background: "var(--cs-pink-bg)", color: "var(--cs-pink-soft)", border: "1px solid var(--cs-pink)", borderRadius: 6, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer" };
