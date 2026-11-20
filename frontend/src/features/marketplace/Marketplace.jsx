
import React, { useMemo, useState } from "react";
import { useSearchParams, Link, useNavigate, useLocation } from "react-router-dom";
import { Card, DataList, Form, Pill, useRemote } from "../../components/UI";
import { useAuth } from "../../app/AuthContext";
import "./PublicHome.css";
import "./MarketplaceProfessional.css";
import PublicNavbar from "../../components/navigation/PublicNavbar";
const PROPERTY_TYPES = [
  { value: "", label: "All property types" },
  { value: "PG", label: "PG" },
  { value: "HOSTEL", label: "Hostel" },
  { value: "FLAT", label: "Flat" },
  { value: "APARTMENT", label: "Apartment" },
  { value: "COLIVING", label: "Co-living" },
  { value: "COMMERCIAL", label: "Commercial" },
];

function monthlyPrice(property) {
  const rents = (property.units || [])
    .map((unit) => Number(unit.rent))
    .filter((rent) => Number.isFinite(rent) && rent > 0);

  return rents.length ? Math.min(...rents) : null;
}

function PropertyGallery({ property }) {
  const photos = property.images?.length
    ? property.images
    : property.imageUrl
      ? [{ id: "cover", imageUrl: property.imageUrl }]
      : [];

  const [active, setActive] = useState(0);

  React.useEffect(() => {
    setActive(0);
  }, [property.id]);

  if (!photos.length) {
    return (
      <div className="gn-gallery-placeholder">
        <span>⌂</span>
        <p>Property photos coming soon</p>
      </div>
    );
  }

  const current = photos[Math.min(active, photos.length - 1)];

  return (
    <div className="gn-public-gallery">
      <img
        className="gn-gallery-main"
        src={current.imageUrl}
        alt={`${property.title} photo ${active + 1}`}
      />

      {photos.length > 1 && (
        <div className="gn-gallery-thumbnails">
          {photos.map((photo, index) => (
            <button
              key={photo.id}
              type="button"
              className={active === index ? "active" : ""}
              onClick={() => setActive(index)}
              aria-label={`View property photo ${index + 1}`}
            >
              <img src={photo.imageUrl} alt="" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Marketplace() {
  const navigate = useNavigate();
  const location = useLocation();
  const inPortal = location.pathname.startsWith("/dashboard/");
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();

  const city = params.get("city") || "";
  const legacyType = params.get("type") || "";
  const maxBudget = params.get("budget") || "";
  const categoryId = params.get("categoryId") || "";
  const activeCategory = categoryId ? `id:${categoryId}` : legacyType ? `type:${legacyType}` : "";

  const [selected, setSelected] = useState(null);
  const fromHomepage = params.get("from") === "home";
  const {data: categoriesData} = useRemote("/categories",[]);
  const categories = Array.isArray(categoriesData) ? categoriesData : [];
  const {data: locationsData} = useRemote("/properties/locations",[]);
  const locations = Array.isArray(locationsData) ? locationsData : [];

  // Existing public endpoint returns published properties.
  const {
    data,
    error,
    busy,
  } = useRemote(
    "/properties/public?city=" + encodeURIComponent(city) + "&categoryId=" + encodeURIComponent(categoryId),
    [city,categoryId]
  );

  const properties = Array.isArray(data) ? data : [];

  const filtered = useMemo(() => {
    return properties.filter((property) => {
      const matchesType =
        !legacyType ||
        String(property.type || "").toUpperCase() === legacyType.toUpperCase();

      const rent = monthlyPrice(property);

      const matchesBudget =
        !maxBudget ||
        (rent !== null && rent <= Number(maxBudget));

      return matchesType && matchesBudget;
    });
  }, [properties, legacyType, maxBudget]);

  function updateFilter(key, value) {
    const next = new URLSearchParams(params);

    if (value) {
      next.set(key, value);
    } else {
      next.delete(key);
    }

    setParams(next);
  }

  function changeCategory(value) {
    const next = new URLSearchParams(params);
    next.delete("type");
    next.delete("categoryId");
    if (value.startsWith("id:")) next.set("categoryId", value.slice(3));
    if (value.startsWith("type:")) next.set("type", value.slice(5));
    setParams(next);
  }
  function clearFilters() {
    setParams(fromHomepage ? { from: "home" } : {});
  }

  return (
    <div className={`marketplace-page gn-explore-pro ${!inPortal ? "gnp-public-content" : ""}`}>
      {!inPortal && <PublicNavbar />}
      <section className="market-search-section">

{/* {!inPortal && (
  <>
    <nav
      className="gn-market-navigation"
      aria-label="Public property navigation"
    >
      <Link
        to="/"
        className="gn-market-brand"
        aria-label="GoyalNest homepage"
      >
        G✦ <span>GoyalNest</span>
      </Link>

      <div className="gn-market-nav-links">
        <Link to="/" className="gn-market-nav-link">
          Home
        </Link>

        <span
          className="gn-market-nav-link is-active"
          aria-current="page"
        >
          Explore Properties
        </span>

        <Link
          to={user ? "/dashboard" : "/login"}
          className="gn-market-nav-action"
        >
          {user ? "My Dashboard" : "Log in"}
        </Link>
      </div>
    </nav>

    <Link to="/" className="gn-market-back-home">
      ← Back to homepage
    </Link>
  </>
)} */}


{!inPortal && (
  <Link to="/" className="gn-market-back-home">
    ← Back to homepage
  </Link>
)}

        <span className="gn-explore-kicker">GOYALNEST / DISCOVER</span>
        <h2 className="gn-explore-heading">Discover homes that fit your lifestyle</h2>
        <p className="muted gn-explore-description">
          Explore published properties, compare rental prices
          and discover available accommodation.
        </p>

        <div className="gn-explore-features" aria-label="Property search benefits">
          <span>Browse published listings</span>
          <span>Compare monthly rent</span>
          <span>Owner-reviewed requests</span>
        </div>
        <div className="gn-filter-panel">
          <div className="gn-filter-panel-header">
            <h3>Find your perfect space</h3>
            <span>Search and refine available listings</span>
          </div>
        <div className="market-filter-grid">
          <label>
            Location
            <input
              type="search"
              placeholder="Search city or locality"
              list="gn-explore-location-options"
              value={city}
              onChange={(e) => updateFilter("city", e.target.value)}
            />
          </label>
          <datalist id="gn-explore-location-options">{locations.map(name=><option key={name} value={name}/>)}</datalist>

          <label>Property Category
            <select value={activeCategory} onChange={e=>changeCategory(e.target.value)}>
              <option value="">All categories</option>
              {categories.map(c=>{const legacy=PROPERTY_TYPES.find(t=>t.value && t.value===c.name.toUpperCase().replaceAll(" ","_"));return <option key={c.id} value={legacy?`type:${legacy.value}`:`id:${c.id}`}>{c.name}</option>})}
              {PROPERTY_TYPES.filter(c=>c.value && !categories.some(x=>x.name.toLowerCase()===c.label.toLowerCase())).map(c=><option key={c.value} value={`type:${c.value}`}>{c.label}</option>)}
            </select>
          </label>
          <label>
            Monthly Budget
            <select
              value={maxBudget}
              onChange={(e) => updateFilter("budget", e.target.value)}
            >
              <option value="">Any Budget</option>
              <option value="5000">Under ₹5,000</option>
              <option value="10000">Under ₹10,000</option>
              <option value="15000">Under ₹15,000</option>
              <option value="20000">Under ₹20,000</option>
              <option value="30000">Under ₹30,000</option>
              <option value="50000">Under ₹50,000</option>
            </select>
          </label>

          <button
            type="button"
            className="btn outline"
            onClick={clearFilters}
          >
            Clear Filters
          </button>
        </div>
        </div>
      </section>

      <section className="section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">CURATED HOMES</span>
            <h2>Available properties</h2>
          </div>
          <Pill>{filtered.length} listings</Pill>
        </div>

        {busy && <p>Loading properties...</p>}

        {error && (
          <p className="error">
            Unable to load properties: {error}
          </p>
        )}

        {!busy && !error && filtered.length === 0 && (
          <div className="empty">
            No published properties match your filters.
            Try another city, category or budget.
          </div>
        )}

        <div className="property-grid">
          {filtered.map((property) => {
            const rent = monthlyPrice(property);

            return (
              <article className="property-card" key={property.id}>
                <div
                  className="property-cover"
                  style={
                    property.imageUrl
                      ? { backgroundImage: `url("${property.imageUrl}")` }
                      : {}
                  }
                >
                  <span className="property-type">
                    {property.category?.name || property.type}
                  </span>
                  {!property.imageUrl && (
                    <span className="cover-mark">G✦</span>
                  )}
                </div>

                <div className="property-body">
                  <p className="eyebrow">
                    {property.city} · {property.locality}
                  </p>

                  <h3>{property.title}</h3>

                  <p className="muted gn-explore-description">
                    {property.description || property.address}
                  </p>

                  {property.amenities && (
  <div className="amenities">
    {property.amenities}
  </div>
)}

                  <div className="property-footer">
                    <strong>
                      {rent === null
                        ? "Price on request"
                        : `₹${rent.toLocaleString("en-IN")}`}
                      {rent !== null && <small> /month</small>}
                    </strong>

                    <button
  type="button"
  className="btn outline"
  onClick={() => navigate(`/properties/${property.id}`)}
>
  View rooms & book →
</button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {selected && (
        <div
          className="modal-backdrop"
          onClick={() => setSelected(null)}
        >
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Property details"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="close"
              aria-label="Close"
              onClick={() => setSelected(null)}
            >
              ×
            </button>

            <span className="eyebrow">PROPERTY DETAILS</span>

            <h2>{selected.title}</h2>
            <PropertyGallery property={selected} />
            <p>
              {selected.address}, {selected.city}
            </p>

            <p>{selected.amenities}</p>

            <h3>Available units</h3>

            <DataList
              items={selected.units}
              empty="No rentable units listed yet."
              render={(unit) => (
                <>
                  <div>
                    <b>{unit.label}</b>
                    <div className="unit-information">
  <p>🏠 {unit.bhk ? `${unit.bhk} BHK` : "Rental Unit"}</p>
  <p>👥 Capacity: {unit.capacity} people</p>
  <p>
    <strong>
      ₹{Number(unit.rent).toLocaleString("en-IN")}
    </strong>
    /month
  </p>
  <p>
    Security Deposit:{" "}
    ₹{Number(unit.depositAmount || 0).toLocaleString("en-IN")}
  </p>
</div>
                  </div>

                  {user?.role === "TENANT" ? (
                    <button
                      type="button"
                      className="btn primary"
                      onClick={() =>
                        setSelected({
                          ...selected,
                          chosen: unit,
                        })
                      }
                    >
                      Request booking
                    </button>
                  ) : !user ? (
                    <Link className="btn outline" to="/login">
                      Sign in to book
                    </Link>
                  ) : (
                    <Pill>Tenant account required</Pill>
                  )}
                </>
              )}
            />

            {selected.chosen && user?.role === "TENANT" && (
              <Card
                title={`Book ${selected.chosen.label}`}
                desc="Owner approval required. Complete your KYC before booking."
              >
                <Form
                  endpoint="/bookings"
                  defaults={{
                    unitId: selected.chosen.id,
                  }}
                  fields={[
                    {
                      name: "moveIn",
                      label: "Move-in date",
                      type: "date",
                      required: true,
                    },
                    {
                      name: "emergencyPhone",
                      label: "Emergency contact",
                      required: true,
                    },
                    {
                      name: "wantsDeposit",
                      label: "Choose optional security deposit",
                      type: "checkbox",
                    },
                  ]}
                  submit="Send booking request"
                  after={() => setSelected(null)}
                />
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
