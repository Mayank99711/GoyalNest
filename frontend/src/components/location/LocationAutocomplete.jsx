import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { MapPin, Search, X } from "lucide-react";
import "./LocationAutocomplete.css";

/** Works with the existing /properties/locations API. Mobile uses a full-screen picker. */
export default function LocationAutocomplete({ value, onChange, locations = [] }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const root = useRef(null);
  const modalInput = useRef(null);
  const id = useId();
  const options = useMemo(() => [...new Set(locations.filter(item => typeof item === "string" && item.trim()).map(item => item.trim()))].sort((a,b) => a.localeCompare(b)), [locations]);
  const filtered = useMemo(() => options.filter(item => item.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 10), [options, query]);

  useEffect(() => {
    if (!open) return;
    const onOutside = (event) => { if (root.current && !root.current.contains(event.target)) setOpen(false); };
    document.addEventListener("pointerdown", onOutside);
    return () => document.removeEventListener("pointerdown", onOutside);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const mobile = window.matchMedia("(max-width: 650px)").matches;
    if (!mobile) return;
    const prior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => modalInput.current?.focus());
    return () => { document.body.style.overflow = prior; };
  }, [open]);

  function select(item) { onChange(item); setQuery(item); setOpen(false); setActive(0); }
  function show() { setQuery(value || ""); setActive(0); setOpen(true); }
  function keys(event) {
    if (event.key === "Escape") { setOpen(false); return; }
    if (event.key === "ArrowDown") { event.preventDefault(); if (!open) show(); else setActive(x => Math.min(x + 1, filtered.length - 1)); }
    if (event.key === "ArrowUp") { event.preventDefault(); setActive(x => Math.max(0, x - 1)); }
    if (event.key === "Enter" && open && filtered.length) { event.preventDefault(); select(filtered[active] || filtered[0]); }
  }
  const results = (suffix) => <div id={`${id}-${suffix}`} className="gn-location-options" role="listbox" aria-label="Available locations">
    {filtered.length ? filtered.map((item, i) => <button key={item} type="button" role="option" aria-selected={active === i} className={active === i ? "gn-location-choice is-active" : "gn-location-choice"} onMouseEnter={() => setActive(i)} onClick={() => select(item)}><MapPin size={17}/><span>{item}</span></button>) : <div className="gn-location-empty">No matching locations. Try another city or locality.</div>}
  </div>;
  return <div ref={root} className="gn-location-root">
    <div className="gn-location-trigger"><MapPin size={18}/><input type="text" value={value} placeholder="Search city or locality" aria-label="Location" aria-haspopup="listbox" aria-expanded={open} aria-controls={`${id}-desktop`} autoComplete="off" onFocus={show} onClick={show} onChange={event => { onChange(event.target.value); setQuery(event.target.value); setActive(0); setOpen(true); }} onKeyDown={keys}/>{value ? <button className="gn-location-clear" type="button" aria-label="Clear location" onClick={() => { onChange(""); setQuery(""); setOpen(false); }}><X size={16}/></button> : null}</div>
    {open && <><div className="gn-location-desktop">{results("desktop")}</div><div className="gn-location-mobile" role="dialog" aria-modal="true" aria-label="Choose location"><header><strong>Select location</strong><button type="button" aria-label="Close location picker" onClick={() => setOpen(false)}><X size={22}/></button></header><div className="gn-location-mobile-search"><Search size={19}/><input ref={modalInput} type="search" aria-label="Search locations" placeholder="Search city or locality" value={query} onChange={event => { setQuery(event.target.value); onChange(event.target.value); setActive(0); }} onKeyDown={keys}/></div><p>AVAILABLE LOCATIONS</p>{results("mobile")}</div></>}
  </div>;
}
