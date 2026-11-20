import React, { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowDown, ArrowLeft, ArrowRight, ArrowUpRight, Building2, CheckCircle2,
  Compass, HeartHandshake, Home, KeyRound, MapPin, Menu, Search,
  ShieldCheck, Sparkles, X,
} from "lucide-react";
import { useRemote } from "../../components/UI";
import "./PublicHome.css";
import "./GoyalNestLanding.css";
import "./LocationFieldOverrides.css";
import LocationAutocomplete from "../../components/location/LocationAutocomplete";
import PublicNavbar from "../../components/navigation/PublicNavbar";

// Visual inspiration: NorthWind Estates. All copy, layouts and interactions are original.
// Remote editorial photos fall back to assets from this GoyalNest project when offline.
const SCENES = [
  {
    image: "https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?w=1800&q=85&fit=crop",
    fallback: "/gn-landing/interior.webp",
    eyebrow: "A NEW PERSPECTIVE ON LIVING",
    title: ["Find the space", "to call yours."],
    description: "Thoughtfully discovered homes, apartments and shared spaces — for every chapter of your journey.",
  },
  {
    image: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1800&q=85&fit=crop",
    fallback: "/gn-landing/interior.webp",
    eyebrow: "SPACES THAT FEEL PERSONAL",
    title: ["Live beautifully.", "Belong naturally."],
    description: "From your first independent apartment to the perfect shared home, discover living on your terms.",
  },
  {
    image: "https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?w=1800&q=85&fit=crop",
    fallback: "/gn-landing/interior.webp",
    eyebrow: "EXPLORE THE POSSIBILITIES",
    title: ["Every address", "has a story."],
    description: "A simpler way to discover your next address, with real listings and an easy path from search to booking.",
  },
];

const CATEGORIES = [
  { label: "Apartments", type: "APARTMENT", subtitle: "Room to make it yours", icon: Building2 },
  { label: "Independent Flats", type: "FLAT", subtitle: "A place of your own", icon: Home },
  { label: "PG & Shared Living", type: "PG", subtitle: "Find your community", icon: HeartHandshake },
  { label: "Hostels", type: "HOSTEL", subtitle: "Comfort, made simple", icon: KeyRound },
];

const STEPS = [
  { num: "01", title: "Explore", detail: "Find properties that match your city, budget and lifestyle." },
  { num: "02", title: "Discover", detail: "See property details, rooms and availability before deciding." },
  { num: "03", title: "Request", detail: "Create an account and start the existing booking journey." },
];

const FAQS = [
  ["How can I find a rental property?", "Search by city, property type and monthly budget. Browse available published listings and open a property to see more details."],
  ["Can I book a property online?", "Where a listing has available units, you can sign in and follow GoyalNest's existing booking and verification process. Requests are subject to owner approval."],
  ["How do I list my property?", "Create an account as a property owner and manage listings through the Owner Portal. Publication is subject to the platform's subscription and approval rules."],
  ["Can I search for PGs and shared accommodation?", "Yes. Use the property-type filter to explore PGs, hostels and shared living when those listings are available."],
];

function EditorialImage({ src, fallback, alt, className = "", loading = "lazy" }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return <img className={className} src={failed ? fallback : src} onError={() => setFailed(true)} alt={alt} loading={loading} decoding="async" />;
}

function Reveal({ children, className = "", delay = 0, as: Tag = "div" }) {
  const ref = useRef(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !window.IntersectionObserver) {
      node.classList.add("gnl-visible");
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { node.classList.add("gnl-visible"); observer.unobserve(node); }
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return <Tag ref={ref} className={`gnl-reveal ${className}`} style={{ "--gnl-delay": `${delay}ms` }}>{children}</Tag>;
}

function currency(amount) {
  return `₹${Number(amount).toLocaleString("en-IN")}`;
}

function priceOf(property) {
  const prices = (property.units || []).filter(u => u.active !== false).map(u => Number(u.rent)).filter(n => Number.isFinite(n) && n > 0);
  return prices.length ? Math.min(...prices) : null;
}

export default function PublicHome({ onLogin, onRegister }) {
  const navigate = useNavigate();
  const [scene, setScene] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [city, setCity] = useState("");
  const [type, setType] = useState("");
  const { data: categoryData } = useRemote("/categories", []);
  const managedCategories = Array.isArray(categoryData) ? categoryData : [];
  const [budget, setBudget] = useState("");
  const [faqOpen, setFaqOpen] = useState(0);
  const { data: propertiesData, busy, error } = useRemote("/properties/public", []);
  const properties = Array.isArray(propertiesData) ? propertiesData : [];
  const featured = properties.slice(0, 3);
  const {data: locationsData} = useRemote("/properties/locations", []);
  const locations = Array.isArray(locationsData) ? locationsData : [];

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = setInterval(() => { if (document.visibilityState === "visible") setScene(index => (index + 1) % SCENES.length); }, 7200);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [menuOpen]);

  function search(event) {
    event.preventDefault();
    const params = new URLSearchParams({ from: "home" });
    if (city.trim()) params.set("city", city.trim());
    if (type.startsWith("id:")) params.set("categoryId", type.slice(3));
    else if (type.startsWith("type:")) params.set("type", type.slice(5));
    if (budget) params.set("budget", budget);
    navigate(`/properties${params.size ? `?${params.toString()}` : ""}`);
  }

  function category(typeValue) { navigate(`/properties?from=home&type=${encodeURIComponent(typeValue)}`); }

  return (
    <div className="gnl-home gnp-public-content gnp-home-content">
      <a className="gnl-skip" href="#gnl-main">Skip to content</a>
      <PublicNavbar />
      <main id="gnl-main">
        <section className="gnl-hero" aria-label="Discover a new way to live">
          <div className="gnl-hero-visual" aria-hidden="true">
            {SCENES.map((item, index) => <EditorialImage key={item.image} src={item.image} fallback={item.fallback} alt="" loading={index === 0 ? "eager" : "lazy"} className={`gnl-hero-photo ${index === scene ? "is-active" : ""}`}/>)}
            <div className="gnl-hero-shade" />
          </div>
          <div className="gnl-hero-inner" key={scene}>
            <p className="gnl-eyebrow gnl-eyebrow-light"><span className="gnl-tiny-line"/>{SCENES[scene].eyebrow}</p>
            <h1>{SCENES[scene].title[0]}<br/><em>{SCENES[scene].title[1]}</em></h1>
            <p className="gnl-hero-description">{SCENES[scene].description}</p>
            <div className="gnl-hero-buttons"><button className="gnl-pill gnl-pill-cream" onClick={() => navigate("/properties?from=home")}>Explore properties <ArrowUpRight size={18}/></button><a className="gnl-hero-discover" href="#gnl-story">Discover GoyalNest <ArrowRight size={18}/></a></div>
          </div>
          <div className="gnl-hero-bottom"><span className="gnl-hero-side-label">CURATED SPACES · CONSIDERED LIVING</span><div className="gnl-hero-indicators">{SCENES.map((_, i) => <button type="button" aria-label={`Show hero slide ${i + 1}`} aria-current={i === scene} className={i === scene ? "is-active" : ""} key={i} onClick={() => setScene(i)}><span/></button>)}</div><a className="gnl-scroll" href="#gnl-explore">SCROLL TO EXPLORE <ArrowDown size={17}/></a></div>
        </section>

        <section className="gnl-search-area" id="gnl-explore"><Reveal className="gnl-search-heading"><span className="gnl-section-kicker">YOUR NEXT CHAPTER STARTS HERE</span><h2>A home worth <em>finding.</em></h2><p>Start with what matters to you. We'll help you discover the rest.</p></Reveal>
          <Reveal delay={100}><form className="gnl-search-form" onSubmit={search}>
            <div className="gnl-location-field"><span>LOCATION</span><LocationAutocomplete value={city} onChange={setCity} locations={locations}/></div>
            <label><span>PROPERTY TYPE</span><div><Building2 size={18}/><select value={type} onChange={e => setType(e.target.value)}><option value="">All categories</option>{managedCategories.map(c=>{const legacy=CATEGORIES.find(t=>t.type===c.name.toUpperCase().replaceAll(" ","_"));return <option key={c.id} value={legacy?`type:${legacy.type}`:`id:${c.id}`}>{c.name}</option>})}{CATEGORIES.filter(c=>!managedCategories.some(m=>m.name.toLowerCase()===c.label.toLowerCase())).map(c=><option key={c.type} value={`type:${c.type}`}>{c.label}</option>)}</select></div></label>
            <label><span>MONTHLY BUDGET</span><div><Compass size={18}/><select value={budget} onChange={e => setBudget(e.target.value)}><option value="">Any budget</option><option value="10000">Under ₹10,000</option><option value="20000">Under ₹20,000</option><option value="30000">Under ₹30,000</option><option value="50000">Under ₹50,000</option></select></div></label>
            <button type="submit" className="gnl-search-submit"><Search size={18}/><span>Find a home</span><ArrowRight size={17}/></button>
          </form></Reveal>
        </section>

        <section id="gnl-story" className="gnl-story gnl-section"><div className="gnl-story-copy"><Reveal><span className="gnl-section-kicker">01 / THE GOYALNEST STORY</span><h2>More than an address.<br/><em>A feeling of belonging.</em></h2><p>We believe finding the right place to live should feel inspiring, not overwhelming. GoyalNest brings homes, apartments and shared spaces together in one thoughtful discovery experience.</p><p>Explore actual listings, compare spaces and take the next step with confidence.</p><Link className="gnl-link" to="/properties?from=home">Explore our properties <ArrowUpRight size={19}/></Link></Reveal></div><Reveal className="gnl-story-image" delay={160}><EditorialImage src="https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?w=1300&q=85&fit=crop" fallback="/gn-landing/interior.webp" alt="Beautifully designed living space"/><div className="gnl-image-caption"><span>SPACES FOR LIVING</span><span>GOYALNEST / 2026</span></div></Reveal></section>

        <section id="gnl-collection" className="gnl-collection gnl-section"><Reveal className="gnl-collection-head"><div><span className="gnl-section-kicker">02 / DISCOVER YOUR SPACE</span><h2>Find what feels <em>right.</em></h2></div><p>From independent apartments to shared homes, there's a place for every way of living.</p></Reveal><div className="gnl-category-grid">{CATEGORIES.map((item, index) => <Reveal key={item.type} delay={index * 75}><button className="gnl-category" type="button" onClick={() => category(item.type)}><div className="gnl-category-icon"><item.icon size={26} strokeWidth={1.4}/></div><div className="gnl-category-bottom"><span className="gnl-category-number">0{index + 1} / SPACE</span><h3>{item.label}</h3><p>{item.subtitle}</p></div><span className="gnl-category-arrow"><ArrowUpRight size={23}/></span></button></Reveal>)}</div></section>

        <section className="gnl-featured gnl-section"><Reveal className="gnl-featured-head"><div><span className="gnl-section-kicker">03 / AVAILABLE HOMES</span><h2>Places to <em>discover.</em></h2></div><Link className="gnl-link" to="/properties?from=home">View all properties <ArrowUpRight size={19}/></Link></Reveal>
          {busy ? <div className="gnl-listing-state">Discovering available properties…</div> : error ? <div className="gnl-listing-state">Listings couldn't load right now. <Link to="/properties?from=home">Open property search</Link></div> : !featured.length ? <div className="gnl-listing-state"><p>New homes are on their way.</p><span>Published listings will appear here automatically.</span><Link to="/properties?from=home">Browse all properties <ArrowUpRight size={16}/></Link></div> : <div className="gnl-featured-grid">{featured.map((property, index) => {const photo = property.images?.[0]?.imageUrl || property.imageUrl; const rent = priceOf(property); return <Reveal key={property.id} delay={index * 95}><Link className="gnl-property" to={`/properties/${encodeURIComponent(property.id)}`}><div className="gnl-property-cover">{photo ? <img src={photo} alt={property.title} loading="lazy"/> : <EditorialImage src="https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?w=800&q=80" fallback="/gn-landing/interior.webp" alt="Residential interior"/>}<span className="gnl-property-tag">{property.type?.replaceAll("_", " ") || "PROPERTY"}</span><span className="gnl-property-action"><ArrowUpRight size={20}/></span></div><div className="gnl-property-info"><span><MapPin size={14}/> {property.locality ? `${property.locality}, ` : ""}{property.city}</span><h3>{property.title}</h3>{Array.isArray(property.units) && property.units.length > 0 && <div className="gnl-property-features"><span><Home size={14}/>{property.units.length} {property.units.length === 1 ? "Unit" : "Units"}</span>{property.units.some(unit => Number(unit.capacity) > 0) && <span><Building2 size={14}/>{property.units.reduce((total, unit) => total + (Number(unit.capacity) || 0), 0)} Total capacity</span>}</div>}<div className="gnl-property-price">{rent !== null ? <><strong>{currency(rent)}</strong><small> / month onwards</small></> : <small>Contact to enquire</small>}</div></div></Link></Reveal>;})}</div>}
        </section>

        <section className="gnl-manifesto"><div className="gnl-manifesto-visual"><EditorialImage src="https://images.unsplash.com/photo-1600585152915-d208bec867a1?w=1500&q=85&fit=crop" fallback="/gn-landing/interior.webp" alt="Inviting modern residence"/></div><div className="gnl-manifesto-copy"><Reveal><span className="gnl-section-kicker">THOUGHTFULLY CURATED</span><h2>Every journey<br/>deserves a<br/><em>beautiful beginning.</em></h2><p>Find a home that works for the way you live today, with space to imagine tomorrow.</p><button className="gnl-pill gnl-pill-cream" onClick={() => navigate("/properties?from=home")}>Discover spaces <ArrowUpRight size={17}/></button></Reveal></div></section>

        <section id="gnl-process" className="gnl-process gnl-section"><Reveal><span className="gnl-section-kicker">04 / A SIMPLER WAY HOME</span><h2>Simple steps. <em>Meaningful moves.</em></h2></Reveal><div className="gnl-steps">{STEPS.map((item, index) => <Reveal className="gnl-step" key={item.num} delay={index * 100}><div className="gnl-step-number">{item.num}</div><h3>{item.title}</h3><p>{item.detail}</p>{index !== STEPS.length - 1 && <ArrowRight className="gnl-step-arrow" size={22}/>}</Reveal>)}</div><Reveal className="gnl-owner-cta"><div><span className="gnl-section-kicker">FOR PROPERTY OWNERS</span><h3>Have a space to share?</h3><p>List your property and manage enquiries through your Owner Portal.</p></div><button className="gnl-pill gnl-pill-dark" onClick={onRegister}>Get started <ArrowUpRight size={18}/></button></Reveal></section>

        {locations.length > 0 && <section className="gnl-locations gnl-section"><Reveal><span className="gnl-section-kicker">05 / DISCOVER LOCATIONS</span><h2>Find your place <em>in the city.</em></h2></Reveal><div className="gnl-location-list">{locations.map((name, index) => <Reveal key={name} delay={index * 70}><button onClick={() => navigate(`/properties?from=home&city=${encodeURIComponent(name)}`)}><span>0{index + 1}</span><strong>{name}</strong><ArrowUpRight size={25}/></button></Reveal>)}</div></section>}

        <section className="gnl-faq gnl-section"><Reveal><span className="gnl-section-kicker">QUESTIONS, ANSWERED</span><h2>Feel at home <em>before you move.</em></h2></Reveal><div className="gnl-faq-list">{FAQS.map(([question, answer], index) => <Reveal key={question} delay={index * 40}><div className="gnl-faq-item"><button type="button" aria-expanded={faqOpen === index} onClick={() => setFaqOpen(faqOpen === index ? -1 : index)}><span>{question}</span><span aria-hidden="true">{faqOpen === index ? "−" : "+"}</span></button>{faqOpen === index && <p>{answer}</p>}</div></Reveal>)}</div></section>

        <footer className="gnl-footer"><div className="gnl-footer-main"><div className="gnl-footer-wordmark">G✦ GoyalNest</div><p>Where thoughtful spaces<br/>meet extraordinary everyday living.</p><div className="gnl-footer-links"><Link to="/properties?from=home">Explore homes</Link><a href="#gnl-story">Our story</a><a href="#gnl-process">How it works</a><button onClick={onLogin}>Sign in</button><button onClick={onRegister}>Join GoyalNest</button></div></div><div className="gnl-footer-bottom"><span>© {new Date().getFullYear()} GoyalNest. All rights reserved.</span><span>PROPERTY & LIVING · DESIGNED TO BELONG</span></div></footer>
      </main>
    </div>
  );
}
