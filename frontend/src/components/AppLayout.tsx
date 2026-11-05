import {
  AlertTriangle,
  BarChart3,
  Building2,
  CheckCircle2,
  Database,
  FileUp,
  LayoutDashboard,
  LogOut,
  Menu,
  Network,
  Share2,
  Sparkles,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { api } from "../lib/api";
import type { Analytics, DashboardData } from "../lib/types";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/upload", label: "Upload", icon: FileUp },
  { to: "/recommendations", label: "Recommendations", icon: Sparkles },
  { to: "/competencies", label: "Competencies", icon: Network },
  { to: "/review", label: "Review", icon: CheckCircle2 },
  { to: "/export", label: "Export", icon: Share2 },
];

const ADMIN_NAV_ITEMS = [
  { to: "/", label: "Analytics", icon: BarChart3, end: true },
  { to: "/admin/universities", label: "Universities", icon: Building2 },
  { to: "/admin/sources", label: "Sources", icon: Database },
];

function firstName(profile: { given_name?: string; display_name: string; email: string }): string {
  const given = (profile.given_name || "").trim();
  if (given) return given;
  const fromDisplay = profile.display_name.trim().split(/\s+/)[0];
  if (fromDisplay) return fromDisplay;
  return profile.email.split("@")[0] || "Faculty";
}

function initials(name: string): string {
  return name.slice(0, 1).toUpperCase();
}

function NavItems({
  items,
  onNavigate,
  vertical = false,
}: {
  items: typeof NAV_ITEMS;
  onNavigate?: () => void;
  vertical?: boolean;
}) {
  return (
    <>
      {items.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              vertical ? "product-nav-link-mobile" : "product-nav-link",
              isActive && "is-active",
            )
          }
        >
          {({ isActive }) => (
            <>
              <Icon aria-hidden="true" />
              <span>{label}</span>
              {isActive && !vertical && (
                <motion.span
                  layoutId="nav-underline"
                  className="product-nav-indicator"
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                />
              )}
            </>
          )}
        </NavLink>
      ))}
    </>
  );
}

export default function AppLayout() {
  const { profile, signOut } = useAuth();
  const location = useLocation();
  const [pendingReviews, setPendingReviews] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const isAdmin = !!profile?.is_admin;

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const pending = isAdmin
      ? api<Analytics>("/api/admin/analytics").then((data) => data.totals.pending)
      : api<DashboardData>("/api/dashboard").then((data) => data.stats.pending_reviews);
    pending.then(setPendingReviews).catch(() => setPendingReviews(0));
  }, [location.pathname, isAdmin]);

  if (!profile) return null;
  const navItems = isAdmin ? ADMIN_NAV_ITEMS : NAV_ITEMS;
  const name = firstName(profile);
  const roleLabel = isAdmin ? "ASPPH Admin" : profile.university.prefix || profile.university.id;

  return (
    <div className="product-shell">
      <div className="product-aurora" aria-hidden="true" />
      <header className="product-topbar">
        <Link to="/" className="product-brand" aria-label="PHACT dashboard">
          <span className="product-brand-mark" aria-hidden="true">
            P
          </span>
          <span>
            <strong>PHACTcheck</strong>
            <small>MyASPPH</small>
          </span>
        </Link>

        <nav className="product-nav hide-mobile" aria-label="Main navigation">
          <NavItems items={navItems} />
        </nav>

        <div className="product-topbar-actions">
          {pendingReviews > 0 && (
            <Button asChild variant="secondary" size="sm" className="pending-glow">
              <Link
                to={isAdmin ? "/admin/universities" : "/review"}
                title={isAdmin ? "Pending repository reviews" : "Pending faculty reviews"}
              >
                <AlertTriangle aria-hidden="true" />
                <Badge variant="orange">{pendingReviews}</Badge>
              </Link>
            </Button>
          )}
          {!isAdmin && (
            <Button asChild variant="teal" size="sm" className="hide-mobile">
              <Link to="/upload">
                <FileUp aria-hidden="true" />
                Upload
              </Link>
            </Button>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="product-user-trigger" title={profile.email}>
                <Avatar size="sm">
                  <AvatarFallback className="bg-[var(--phact-navy)] text-white">
                    {initials(name)}
                  </AvatarFallback>
                </Avatar>
                <span className="hide-mobile product-user-meta">
                  <strong>{name}</strong>
                  <small>{roleLabel}</small>
                </span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div className="flex flex-col gap-0.5">
                  <span>{profile.display_name}</span>
                  <span className="text-xs font-normal text-muted-foreground">{profile.email}</span>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => void signOut()}>
                <LogOut aria-hidden="true" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="show-mobile" aria-label="Open menu">
                <Menu aria-hidden="true" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="product-mobile-sheet">
              <SheetHeader>
                <SheetTitle>Navigate</SheetTitle>
              </SheetHeader>
              <nav className="product-mobile-nav" aria-label="Mobile navigation">
                <NavItems items={navItems} vertical onNavigate={() => setMenuOpen(false)} />
                <button
                  type="button"
                  className="product-nav-link-mobile sign-out"
                  onClick={() => void signOut()}
                >
                  <LogOut aria-hidden="true" />
                  Sign out
                </button>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </header>

      <main className="product-content">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
