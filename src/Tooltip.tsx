import { createContext, useCallback, useContext, useRef, useState } from "react";
import { createPortal } from "react-dom";

const TooltipContext = createContext(true);

export function TooltipProvider({
  enabled,
  children,
}: {
  enabled: boolean;
  children: React.ReactNode;
}) {
  return <TooltipContext.Provider value={enabled}>{children}</TooltipContext.Provider>;
}

interface TooltipProps {
  title?: string;
  content: string;
  placement?: "top" | "bottom" | "left" | "right";
  children: React.ReactNode;
  style?: React.CSSProperties;
}

export function Tooltip({
  title,
  content,
  placement = "top",
  children,
  style,
}: TooltipProps) {
  const enabled = useContext(TooltipContext);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number; actualPlacement: "top" | "bottom" } | null>(null);

  const show = useCallback(() => {
    if (!enabled) return;
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const tipWidth = 264;
    const margin = 10;

    let left = rect.left + rect.width / 2;
    const minCenter = tipWidth / 2 + margin;
    const maxCenter = window.innerWidth - tipWidth / 2 - margin;
    left = Math.max(minCenter, Math.min(maxCenter, left));

    let actualPlacement: "top" | "bottom" = placement === "bottom" ? "bottom" : "top";
    if (actualPlacement === "top" && rect.top < 110) {
      actualPlacement = "bottom";
    } else if (actualPlacement === "bottom" && window.innerHeight - rect.bottom < 110) {
      actualPlacement = "top";
    }

    const top = actualPlacement === "top" ? rect.top - 8 : rect.bottom + 8;
    setCoords({ top, left, actualPlacement });
  }, [enabled, placement]);

  const hide = useCallback(() => setCoords(null), []);

  if (!enabled) {
    return <span style={{ display: "inline-flex", alignItems: "center", ...style }}>{children}</span>;
  }

  return (
    <>
      <span
        ref={wrapRef}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        style={{ display: "inline-flex", alignItems: "center", ...style }}
      >
        {children}
      </span>
      {coords &&
        createPortal(
          <div
            role="tooltip"
            style={{
              position: "fixed",
              top: coords.top,
              left: coords.left,
              transform: coords.actualPlacement === "top" ? "translate(-50%, -100%)" : "translate(-50%, 0)",
              zIndex: 9999,
              pointerEvents: "none",
              maxWidth: 264,
              width: "max-content",
              padding: "8px 11px",
              borderRadius: 8,
              background: "var(--cs-card)",
              border: "1px solid var(--cs-border-strong)",
              boxShadow: "0 12px 30px rgba(0, 0, 0, 0.35), 0 0 0 1px var(--cs-pink-border)",
              color: "var(--cs-text)",
              fontSize: 11.5,
              lineHeight: 1.45,
              textAlign: "left",
              fontWeight: 400,
              whiteSpace: "normal",
            }}
          >
            {title && (
              <div style={{ fontWeight: 700, color: "var(--cs-pink)", marginBottom: 2, fontSize: 11.5 }}>
                {title}
              </div>
            )}
            <div style={{ color: "var(--cs-text-body)" }}>{content}</div>
          </div>,
          document.body
        )}
    </>
  );
}

interface HelpDotProps {
  title?: string;
  content: string;
  placement?: "top" | "bottom";
}

export function HelpDot({ title, content, placement = "top" }: HelpDotProps) {
  const enabled = useContext(TooltipContext);
  if (!enabled) return null;

  return (
    <Tooltip title={title} content={content} placement={placement}>
      <span
        tabIndex={0}
        aria-label={title ? `${title}: ${content}` : content}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 14,
          height: 14,
          borderRadius: "50%",
          fontSize: 9.5,
          fontWeight: 700,
          color: "var(--cs-text-muted)",
          background: "var(--cs-code-bg)",
          border: "1px solid var(--cs-code-border)",
          cursor: "help",
          marginLeft: 5,
          flexShrink: 0,
        }}
      >
        ?
      </span>
    </Tooltip>
  );
}
