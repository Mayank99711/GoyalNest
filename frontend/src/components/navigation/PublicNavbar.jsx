import React, { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, X, ChevronDown, LayoutDashboard, LogIn } from "lucide-react";
import { useAuth } from "../../app/AuthContext";
import "./PublicNavbar.css";

const portalNames = { ADMIN: "Super Admin Portal", OWNER: "Owner Portal", MANAGER: "Manager Portal", TENANT: "Tenant Portal" };
const links = [
  { title: "Home", url: "/" },
  { title: "Explore Properties", url: "/properties?from=home" },
  { title: "Our Spaces", url: "/#gnl-collection" },
  { title: "About", url: "/#gnl-story" },
  { title: "How It Works", url: "/#gnl-process" },
];

/** Only mount on public routes; portals continue to use their own sidebar/header. */
export default function PublicNavbar() {
  const { user } = useAuth();
  const accountName = typeof user?.name === "string" && user.name.trim() ? user.name.trim() : "My Account";
  const location = useLocation();
  const [hidden, setHidden] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const lastY = useRef(0);
  const navRef = useRef(null);
  const isHome = location.pathname === "/";

  useEffect(() => {
    lastY.current = window.scrollY;
    setHidden(false);
    setMenuOpen(false);
    setAccountOpen(false);
  }, [location.pathname, location.search, location.hash]);

  useEffect(() => {
    if (!isHome || !location.hash) return;
    const frame = window.requestAnimationFrame(() => {
      const target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isHome, location.hash]);

  useEffect(() => {
    const onScroll = () => {
      const now = window.scrollY;
      const delta = now - lastY.current;
      if (now < 80 || menuOpen || accountOpen) setHidden(false);
      else if (delta > 5) setHidden(true);
      else if (delta < -5) setHidden(false);
      lastY.current = now;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [menuOpen, accountOpen]);

  useEffect(() => {
    if (!menuOpen && !accountOpen) return;
    const onKey = (event) => {
      if (event.key === "Escape") { setMenuOpen(false); setAccountOpen(false); }
    };
    const onClick = (event) => { if (navRef.current && !navRef.current.contains(event.target)) { setMenuOpen(false); setAccountOpen(false); } };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onClick);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("pointerdown", onClick); };
  }, [menuOpen, accountOpen]);

  return (
    <header ref={navRef} className={`gnp-navbar ${hidden ? "gnp-hidden" : ""} ${isHome ? "gnp-on-home" : ""}`}>
      <Link to="/" className="gnp-logo" aria-label="GoyalNest homepage">G<span>✦</span> <strong>GoyalNest</strong></Link>
      <nav className="gnp-links" aria-label="Public navigation">
        {links.map(item => <Link key={item.title} to={item.url} aria-current={location.pathname === item.url ? "page" : undefined}>{item.title}</Link>)}
      </nav>
      <div className="gnp-actions">
        {user ? (
          <div className="gnp-account">
            <button type="button" className="gnp-account-trigger" onClick={() => setAccountOpen(v => !v)} aria-haspopup="menu" aria-expanded={accountOpen}>
              <span className="gnp-account-name" title={accountName}>{accountName}</span> <ChevronDown size={16}/>
            </button>
            {accountOpen && <div className="gnp-account-menu" role="menu"><Link role="menuitem" to="/dashboard" onClick={() => setAccountOpen(false)}><LayoutDashboard size={17}/> Back to {portalNames[user.role] || "Dashboard"}</Link></div>}
          </div>
        ) : (
          <><Link to="/login" className="gnp-signin"><LogIn size={16}/> Sign in</Link><Link to="/register" className="gnp-get-started">Get started</Link></>
        )}
      </div>
      <button type="button" className="gnp-mobile-toggle" aria-label={menuOpen ? "Close navigation" : "Open navigation"} aria-expanded={menuOpen} onClick={() => setMenuOpen(v => !v)}>{menuOpen ? <X size={22}/> : <Menu size={22}/>}</button>
      {menuOpen && <nav className="gnp-mobile-menu" aria-label="Mobile public navigation">
        {links.map(item => <Link to={item.url} key={item.title} onClick={() => setMenuOpen(false)}>{item.title}</Link>)}
        {user ? <><span className="gnp-mobile-account-name">Signed in as {accountName}</span><Link to="/dashboard" onClick={() => setMenuOpen(false)}>Back to {portalNames[user.role] || "Dashboard"}</Link></> : <><Link to="/login" onClick={() => setMenuOpen(false)}>Sign in</Link><Link to="/register" onClick={() => setMenuOpen(false)}>Get started</Link></>}
      </nav>}
    </header>
  );
}
