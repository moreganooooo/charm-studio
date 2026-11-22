import { useEffect, useState } from "react";
import { ArrowRight, Check, Loader2, Moon, Sun } from "lucide-react";
import { RouteLink, useRouter, type AppRoute } from "../router";
import { useStudioStore } from "../store/studioStore";
import { ensureEngineReady } from "../wasmEngine";
import { CHARM_TOKENS, studioStyles } from "./studioStyles";

const NAV_ITEMS: { to: AppRoute; label: string }[] = [
  { to: "/gallery", label: "Gallery" },
  { to: "/desktop", label: "Desktop" },
  { to: "/docs", label: "Docs" },
];

export function SiteNavBar() {
  const { route, navigate } = useRouter();
  const { appMode, setAppMode } = useStudioStore();
  const [wasmReady, setWasmReady] = useState(false);

  useEffect(() => {
    let active = true;
    void ensureEngineReady()
      .then(() => {
        if (active) setWasmReady(true);
      })
      .catch(() => {
        // Ignore WASM warmup errors in non-browser or restricted contexts
      });
    return () => {
      active = false;
    };
  }, []);

  const isHome = route === "/";

  return (
    <header
      style={{
        height: 60,
        position: "sticky",
        top: 0,
        zIndex: 40,
        display: "grid",
        gridTemplateColumns: "1fr auto 1fr",
        alignItems: "center",
        gap: 16,
        padding: "0 clamp(16px, 4vw, 48px)",
        background: isHome && appMode === "dark" ? "rgba(18, 12, 26, 0.72)" : "var(--cs-nav-bg)",
        backdropFilter: "blur(12px)",
        borderBottom: `1px solid ${isHome && appMode === "dark" ? "rgba(185, 162, 255, 0.14)" : CHARM_TOKENS.border}`,
      }}
    >
      {/* Left: Brand Wordmark */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-start" }}>
        <RouteLink
          to="/"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            textDecoration: "none",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="currentColor"
            style={{ color: CHARM_TOKENS.pink }}
            aria-hidden="true"
          >
            <path d="M12 1L14.8 9.2L23 12L14.8 14.8L12 23L9.2 14.8L1 12L9.2 9.2L12 1Z" />
          </svg>
          <span
            style={{
              fontSize: 16,
              fontWeight: 700,
              letterSpacing: "-0.02em",
              color: CHARM_TOKENS.textHeading,
            }}
          >
            Charm Studio
          </span>
        </RouteLink>
      </div>

      {/* Center: Subpage Navigation Links */}
      <nav aria-label="Primary navigation" style={{ display: "flex", alignItems: "center", gap: 26 }}>
        {NAV_ITEMS.map((item) => {
          const active = route === item.to;
          return (
            <RouteLink
              key={item.to}
              to={item.to}
              style={{
                textDecoration: "none",
                padding: "5px 4px",
                fontSize: 13.5,
                fontWeight: active ? 700 : 500,
                whiteSpace: "nowrap",
                flexShrink: 0,
                color: active ? CHARM_TOKENS.textHeading : CHARM_TOKENS.textMuted,
                borderBottom: active ? `2px solid ${CHARM_TOKENS.pink}` : "2px solid transparent",
                transition: "color 140ms ease, border-color 140ms ease",
              }}
            >
              {item.label}
            </RouteLink>
          );
        })}
      </nav>

      {/* Right: Glowing WASM Ready Pill + Theme Toggle + Studio CTA on subpages */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10 }}>
        <span
          className="cs-mono"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 14px",
            borderRadius: 999,
            fontSize: 11.5,
            fontWeight: 700,
            whiteSpace: "nowrap",
            background: wasmReady
              ? "linear-gradient(135deg, #6dffc2 0%, #52ebcc 100%)"
              : CHARM_TOKENS.bgSurface,
            border: `1px solid ${wasmReady ? "rgba(109, 255, 194, 0.85)" : CHARM_TOKENS.border}`,
            color: wasmReady ? "#0f1c19" : CHARM_TOKENS.textMuted,
            boxShadow: wasmReady ? "0 0 22px rgba(109, 255, 194, 0.34)" : "none",
            transition: "all 220ms ease",
          }}
        >
          <span>{wasmReady ? "Go 1.26 WASM Ready" : "Warming Go WASM…"}</span>
          {wasmReady ? <Check size={13} strokeWidth={2.8} /> : <Loader2 size={13} />}
        </span>

        <button
          onClick={() => setAppMode((m) => (m === "dark" ? "light" : "dark"))}
          aria-label={appMode === "dark" ? "Switch to Light UI" : "Switch to Dark Aubergine UI"}
          title={appMode === "dark" ? "Switch to Light UI" : "Switch to Dark Aubergine UI"}
          style={{
            ...studioStyles.secondaryBtn,
            padding: "6px 8px",
            borderRadius: 999,
          }}
        >
          {appMode === "dark" ? <Sun size={13} /> : <Moon size={13} />}
        </button>

        {!isHome && (
          <button
            onClick={() => navigate("/studio")}
            style={{
              ...studioStyles.primaryCta,
              padding: "6px 13px",
              borderRadius: 999,
            }}
          >
            <span>Open Studio</span>
            <ArrowRight size={13} />
          </button>
        )}
      </div>
    </header>
  );
}
