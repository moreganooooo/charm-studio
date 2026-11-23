import { ArrowRight, Moon, Sun } from "lucide-react";
import { RouteLink, useRouter, type AppRoute } from "../router";
import { useStudioStore } from "../store/studioStore";
import { CHARM_TOKENS, studioStyles } from "./studioStyles";

const NAV_ITEMS: { to: AppRoute; label: string }[] = [
  { to: "/gallery", label: "Gallery" },
  { to: "/desktop", label: "Desktop" },
  { to: "/docs", label: "Docs" },
];

export function SiteNavBar() {
  const { route, navigate } = useRouter();
  const { appMode, setAppMode } = useStudioStore();

  const isHome = route === "/";

  return (
    <header
      className={isHome ? "site-nav site-nav-home" : "site-nav"}
      style={{
        position: "sticky",
        top: 0,
        zIndex: 40,
        display: "grid",
        alignItems: "center",
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
            className="cs-wordmark-ink"
            style={{
              fontSize: 16,
              fontWeight: 700,
              letterSpacing: "-0.02em",
            }}
          >
            Charm Studio
          </span>
        </RouteLink>
      </div>

      {/* Center: Subpage Navigation Links */}
      <nav aria-label="Primary navigation">
        {NAV_ITEMS.map((item) => {
          const active = route === item.to;
          return (
            <RouteLink
              key={item.to}
              to={item.to}
              aria-current={active ? "page" : undefined}
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

      {/* Right: Theme Toggle + Open Studio CTA */}
      <div className="site-nav-tools">
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

        <button
          className="site-nav-studio"
          onClick={() => navigate("/studio")}
        >
          <span>Open Studio</span>
          <ArrowRight size={13} strokeWidth={2.4} />
        </button>
      </div>
    </header>
  );
}
