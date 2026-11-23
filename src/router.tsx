import { createContext, useCallback, useContext, useEffect, useMemo, useState, type AnchorHTMLAttributes, type MouseEvent, type ReactNode } from "react";

export type AppRoute = "/" | "/studio" | "/gallery" | "/desktop" | "/docs";

const VALID_ROUTES = new Set<AppRoute>(["/", "/studio", "/gallery", "/desktop", "/docs"]);
const VISITED_KEY = "charmstudio:visited:v1";

function getBasePrefix(): string {
  const raw = import.meta.env.BASE_URL || "/";
  if (raw === "/") return "";
  return raw.endsWith("/") ? raw.slice(0, -1) : raw;
}

function normalizeRouteCandidate(raw: string | null | undefined): AppRoute | null {
  if (!raw) return null;
  let path = raw.trim();
  if (!path.startsWith("/")) path = `/${path}`;
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
  return VALID_ROUTES.has(path as AppRoute) ? (path as AppRoute) : null;
}

function stripBaseFromPathname(pathname: string): AppRoute | null {
  const basePrefix = getBasePrefix();
  let relative = pathname || "/";
  if (basePrefix && relative.startsWith(basePrefix)) {
    relative = relative.slice(basePrefix.length) || "/";
  }
  return normalizeRouteCandidate(relative);
}

export function buildHref(route: AppRoute): string {
  const basePrefix = getBasePrefix();
  if (route === "/") {
    return basePrefix ? `${basePrefix}/` : "/";
  }
  return `${basePrefix}${route}`;
}

export function markStudioVisited(): void {
  try {
    localStorage.setItem(VISITED_KEY, "true");
  } catch {
    // Ignore storage quota or private browsing errors
  }
}

function resolveInitialEntry(): { route: AppRoute; cleanedUrl: string | null } {
  if (typeof window === "undefined") {
    return { route: "/", cleanedUrl: null };
  }

  const loc = window.location;
  const params = new URLSearchParams(loc.search);
  const routeParam = normalizeRouteCandidate(params.get("route"));
  const hasShareHash = loc.hash.startsWith("#s=");
  const hasProjectQuery = params.has("p") && Boolean(params.get("p"));

  // Compute cleaned URL if coming from ?route=... 404 fallback
  let cleanedUrl: string | null = null;
  if (params.has("route")) {
    const cleanParams = new URLSearchParams(loc.search);
    cleanParams.delete("route");
    const targetRoute = routeParam ?? "/";
    const searchStr = cleanParams.toString();
    cleanedUrl = `${buildHref(targetRoute)}${searchStr ? `?${searchStr}` : ""}${loc.hash}`;
  }

  // Priority 1: Shared #s= hash or ?p= cloud project always launches directly into /studio
  if (hasShareHash || hasProjectQuery) {
    return {
      route: "/studio",
      cleanedUrl: params.has("route")
        ? `${buildHref("/studio")}${(() => {
            const p = new URLSearchParams(loc.search);
            p.delete("route");
            const s = p.toString();
            return s ? `?${s}` : "";
          })()}${loc.hash}`
        : null,
    };
  }

  // Priority 2: Explicit ?route=... from 404 fallback or explicit non-root pathname
  if (routeParam) {
    return { route: routeParam, cleanedUrl };
  }

  const pathRoute = stripBaseFromPathname(loc.pathname);
  if (pathRoute && pathRoute !== "/") {
    return { route: pathRoute, cleanedUrl: null };
  }

  // Default: Launch page (/) is always the default entry
  return { route: "/", cleanedUrl: null };
}

interface RouterContextValue {
  route: AppRoute;
  navigate: (to: AppRoute, opts?: { replace?: boolean }) => void;
  markVisited: () => void;
}

const RouterContext = createContext<RouterContextValue | null>(null);

export function RouterProvider({ children }: { children: ReactNode }) {
  const initial = useMemo(() => resolveInitialEntry(), []);
  const [route, setRoute] = useState<AppRoute>(initial.route);

  useEffect(() => {
    if (initial.cleanedUrl) {
      window.history.replaceState(null, "", initial.cleanedUrl);
    }
  }, [initial.cleanedUrl]);

  useEffect(() => {
    if (route === "/studio") {
      markStudioVisited();
    }
  }, [route]);

  useEffect(() => {
    const onPopState = () => {
      const params = new URLSearchParams(window.location.search);
      const fromQuery = normalizeRouteCandidate(params.get("route"));
      const fromPath = stripBaseFromPathname(window.location.pathname);
      setRoute(fromQuery ?? fromPath ?? "/");
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const navigate = useCallback((to: AppRoute, opts?: { replace?: boolean }) => {
    if (to === "/studio") {
      markStudioVisited();
    }
    const href = buildHref(to);
    if (typeof window !== "undefined") {
      const currentFull = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (currentFull !== href) {
        if (opts?.replace) {
          window.history.replaceState(null, "", href);
        } else {
          window.history.pushState(null, "", href);
        }
      }
      window.scrollTo({ top: 0, behavior: "auto" });
    }
    setRoute(to);
  }, []);

  const value = useMemo<RouterContextValue>(
    () => ({
      route,
      navigate,
      markVisited: markStudioVisited,
    }),
    [route, navigate]
  );

  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export function useRouter(): RouterContextValue {
  const ctx = useContext(RouterContext);
  if (!ctx) {
    throw new Error("useRouter must be used inside RouterProvider");
  }
  return ctx;
}

interface RouteLinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> {
  to: AppRoute;
  onClick?: (e: MouseEvent<HTMLAnchorElement>) => void;
}

export function RouteLink({ to, onClick, children, ...rest }: RouteLinkProps) {
  const { navigate } = useRouter();
  const href = buildHref(to);

  return (
    <a
      href={href}
      onClick={(e) => {
        if (onClick) onClick(e);
        if (e.defaultPrevented) return;
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        navigate(to);
      }}
      {...rest}
    >
      {children}
    </a>
  );
}
