import { useState } from "react";
import type { User } from "@supabase/supabase-js";
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
      options: { redirectTo: window.location.origin + window.location.pathname },
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
        background: "rgba(8, 7, 14, 0.74)", backdropFilter: "blur(6px)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(660px, 100%)", maxHeight: "88vh", overflowY: "auto",
          background: "#13111d", border: "1px solid #382f57", borderRadius: 14,
          padding: 22, boxShadow: "0 24px 60px rgba(0,0,0,0.65)",
          display: "flex", flexDirection: "column", gap: 16,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, color: "#f5d0fe" }}>Saved Projects &amp; Cloud Sync</h2>
            <div style={{ fontSize: 12, color: "#8b82ad", marginTop: 3 }}>
              Save multiple layouts locally right away, or sign in with GitHub to sync across devices.
            </div>
          </div>
          <button onClick={onClose} style={btn}>✕</button>
        </div>

        <div style={card}>
          {!isSupabaseConfigured ? (
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#5eead4" }}>Local Library Active</div>
              <div style={{ fontSize: 11.5, color: "#8b82ad", marginTop: 2 }}>
                Projects save in this browser’s storage. Add <code style={code}>VITE_SUPABASE_URL</code> &amp;{" "}
                <code style={code}>VITE_SUPABASE_ANON_KEY</code> to <code style={code}>web/.env.local</code> to unlock GitHub Cloud Sync.
              </div>
            </div>
          ) : user ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {avatarUrl && <img src={avatarUrl} alt="" style={{ width: 32, height: 32, borderRadius: "50%", border: "1px solid #ff75b5" }} />}
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#fdf4ff" }}>
                    @{userName} <span style={{ fontSize: 11, color: "#5eead4", marginLeft: 6 }}>● Cloud Sync Active</span>
                  </div>
                  <div style={{ fontSize: 11.5, color: "#8b82ad" }}>Your saved layouts sync automatically to your account.</div>
                </div>
              </div>
              <button onClick={signOut} style={btn}>Sign Out</button>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#f5d0fe" }}>Sync Projects in the Cloud</div>
                <div style={{ fontSize: 11.5, color: "#8b82ad", marginTop: 2 }}>
                  Sign in with GitHub to back up layouts and create short public share links.
                </div>
              </div>
              <button onClick={signInWithGitHub} style={primaryBtn}>Sign in with GitHub</button>
            </div>
          )}
          {authMsg && <div style={{ marginTop: 8, fontSize: 12, color: "#fda4af" }}>{authMsg}</div>}
        </div>

        <div style={card}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: "#e9d5ff", marginBottom: 8 }}>
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
          <div style={{ fontSize: 12.5, fontWeight: 700, color: "#e9d5ff", marginBottom: 10 }}>
            Your Projects ({projects.length})
          </div>
          {projects.length === 0 ? (
            <div style={{ fontSize: 12, color: "#7e769e", padding: "12px 0" }}>
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
                      background: isActive ? "rgba(255, 117, 181, 0.10)" : "#12101c",
                      border: `1px solid ${isActive ? "#ff75b5" : "#26213a"}`,
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ minWidth: 150, flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: "#fdf4ff" }}>
                        <span>{p.name}</span>
                        <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 999, background: "#0c0b12", color: p.source === "cloud" ? "#5eead4" : "#c4b5fd", border: "1px solid #2d2645" }}>
                          {p.source === "cloud" ? "☁ Cloud" : "Local"}
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: "#7e769e", marginTop: 2 }}>
                        Updated {new Date(p.updatedAt).toLocaleString()}
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      {p.source === "cloud" && (
                        <>
                          <button
                            onClick={() => onTogglePublic(p)}
                            title="Toggle public short-link visibility"
                            style={{ ...btn, fontSize: 11, color: p.isPublic ? "#5eead4" : "#a59ec9" }}
                          >
                            {p.isPublic ? "🌐 Public" : "🔒 Private"}
                          </button>
                          {p.isPublic && (
                            <button onClick={() => copyCloudLink(p.id)} style={{ ...btn, fontSize: 11 }}>
                              {copiedId === p.id ? "✓ Copied" : "Copy ?p= Link"}
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
                      <button onClick={() => onDeleteProject(p)} style={{ ...btn, color: "#fb7185" }} title="Delete project">
                        🗑
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

const code: React.CSSProperties = { fontFamily: "ui-monospace, monospace", fontSize: 11, padding: "1px 5px", borderRadius: 4, background: "#0c0b12", color: "#f5d0fe" };
const card: React.CSSProperties = { background: "#181526", border: "1px solid #2b2442", borderRadius: 10, padding: 14 };
const inp: React.CSSProperties = { background: "#0c0b12", color: "#ede9fe", border: "1px solid #322b4d", borderRadius: 6, padding: "6px 8px", fontSize: 12 };
const btn: React.CSSProperties = { background: "#1b1729", color: "#ddd6fe", border: "1px solid #322b4d", borderRadius: 6, padding: "6px 10px", fontSize: 12, cursor: "pointer" };
const primaryBtn: React.CSSProperties = { background: "rgba(255, 117, 181, 0.20)", color: "#ff99c8", border: "1px solid #ff75b5", borderRadius: 6, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer" };
