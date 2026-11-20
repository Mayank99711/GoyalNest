
import React, { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useRemote } from "../../components/UI";
import { api } from "../../lib/api";
import { useAuth } from "../../app/AuthContext";
import "./PropertyDetails.css";
import PublicNavbar from "../../components/navigation/PublicNavbar";

const money = (amount) =>
  `₹${Number(amount || 0).toLocaleString("en-IN")}`;

export default function PropertyDetails() {
  const { id } = useParams();
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [activeImage, setActiveImage] = useState(0);
  const [selectedUnit, setSelectedUnit] = useState(null);
  const [moveIn, setMoveIn] = useState("");
  const [emergencyPhone, setEmergencyPhone] = useState("");
  const [wantsDeposit, setWantsDeposit] = useState(false);
  const [bookingBusy, setBookingBusy] = useState(false);
  const [bookingError, setBookingError] = useState("");
  const [bookingSuccess, setBookingSuccess] = useState(null);
  const today = new Date().toLocaleDateString("en-CA");

  useEffect(() => {
    const requested = location.state?.openBookingUnitId;
    if (user?.role === "TENANT" && requested) {
      setSelectedUnit(requested);
      setBookingError("");
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [user?.role, location.state, location.pathname, navigate]);

  useEffect(() => {
    if (selectedUnit === null && !bookingSuccess) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onEscape = e => { if (e.key === "Escape" && !bookingBusy) { setSelectedUnit(null); setBookingSuccess(null); } };
    document.addEventListener("keydown", onEscape);
    return () => { document.body.style.overflow = previous; document.removeEventListener("keydown", onEscape); };
  }, [selectedUnit, bookingSuccess, bookingBusy]);

  function openBooking(unitId) {
    setBookingError("");
    setBookingSuccess(null);
    if (!user) {
      navigate("/login", { state: { bookingReturn: { propertyId: id, unitId } } });
      return;
    }
    if (user.role !== "TENANT") return;
    setSelectedUnit(unitId);
  }

  async function submitBooking(event) {
    event.preventDefault();
    if (!selected || bookingBusy) return;
    if (user?.role !== "TENANT") {
      setBookingError("Only tenant accounts may book properties.");
      return;
    }
    setBookingBusy(true);
    setBookingError("");
    try {
      const result = await api("/bookings", {
        method: "POST",
        body: { unitId: selected.id, moveIn, emergencyPhone: emergencyPhone.trim(), wantsDeposit }
      });
      setBookingSuccess(result);
      setSelectedUnit(null);
    } catch (err) {
      setBookingError(err.message || "Unable to submit booking. Please try again.");
    } finally {
      setBookingBusy(false);
    }
  }

  const { data, busy, error } = useRemote(
    `/properties/public/${encodeURIComponent(id)}`,
    [id]
  );

  if (busy) {
    return (
      <div className="pd-status">
        Loading property details...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="pd-status">
        <h2>Property unavailable</h2>
        <p>{error || "Property not found."}</p>
        <Link to="/properties" className="pd-button">
          Explore Properties
        </Link>
      </div>
    );
  }

  const property = data;
  const units = property.units || [];

  const photos = property.images?.length
    ? property.images
    : property.imageUrl
      ? [{ id: "cover", imageUrl: property.imageUrl }]
      : [];

  const orderedPhotos = [...photos].sort(
    (a, b) =>
      Number(b.imageUrl === property.imageUrl) -
      Number(a.imageUrl === property.imageUrl)
  );

  const currentPhoto =
    orderedPhotos[Math.min(activeImage, orderedPhotos.length - 1)];

  const startingRent = units.length
    ? Math.min(...units.map(unit => Number(unit.rent)))
    : null;

  const selected = units.find(unit => unit.id === selectedUnit);
  const availableUnits = units.filter(unit => unit.active && Number(unit.availableSlots ?? unit.capacity) > 0);
  const cancelBooking = () => { if (!bookingBusy) { setSelectedUnit(null); setBookingError(""); } };

  return (
    <div className="pd-page gnp-public-content">
      <PublicNavbar />

      <main className="pd-container">

        <Link to="/properties" className="pd-back">
          ← Back to properties
        </Link>

        <div className="pd-heading">
          <div>
            <span className="pd-eyebrow">
              VERIFIED MARKETPLACE LISTING
            </span>

            <h1>{property.title}</h1>

            <p>
              📍 {property.address}, {property.city}
            </p>
          </div>

          <span className="pd-type">
            {property.category?.name || property.type}
          </span>
        </div>

        <section className="pd-gallery">
          {currentPhoto ? (
            <img
              className="pd-main-image"
              src={currentPhoto.imageUrl}
              alt={`${property.title} interior`}
            />
          ) : (
            <div className="pd-no-image">
              <span>⌂</span>
              <p>Property photos coming soon</p>
            </div>
          )}

          {orderedPhotos.length > 1 && (
            <div className="pd-thumbnails">
              {orderedPhotos.map((photo, index) => (
                <button
                  type="button"
                  key={photo.id}
                  className={
                    activeImage === index ? "active" : ""
                  }
                  onClick={() => setActiveImage(index)}
                  aria-label={`View photo ${index + 1}`}
                >
                  <img src={photo.imageUrl} alt="" />
                </button>
              ))}
            </div>
          )}
        </section>

        <div className="pd-content-grid">
          <div className="pd-main-column">

            <section className="pd-section">
              <h2>About this property</h2>

              <p>
                {property.description ||
                  "Property description not available."}
              </p>
            </section>

            <section className="pd-section">
              <h2>Property highlights</h2>

              <div className="pd-highlights">
                <div>
                  <span>Property type</span>
                  <strong>{property.category?.name || property.type}</strong>
                </div>

                <div>
                  <span>Rentable units</span>
                  <strong>{units.length}</strong>
                </div>

                <div>
                  <span>Starting rent</span>
                  <strong>
                    {startingRent !== null
                      ? `${money(startingRent)}/month`
                      : "On request"}
                  </strong>
                </div>

                <div>
                  <span>Location</span>
                  <strong>{property.city}</strong>
                </div>
              </div>
            </section>

            <section className="pd-section">
              <h2>Amenities & facilities</h2>

              {property.amenities ? (
                <div className="pd-amenities">
                  {property.amenities
                    .split(",")
                    .map(item => item.trim())
                    .filter(Boolean)
                    .map((item, index) => (
                      <span key={`${item}-${index}`}>
                        ✓ {item}
                      </span>
                    ))}
                </div>
              ) : (
                <p>Amenities not specified by the owner.</p>
              )}
            </section>

            <section className="pd-section" id="available-rooms">
              <h2>Available rooms & units</h2>
              <p>Choose an available room to send a booking request. Owner approval is required.</p>

              {availableUnits.length === 0 && (
                <p>No rooms available for booking right now.</p>
              )}

              <div className="pd-units">
                {units.map(unit => (
                  <article className="pd-unit-card" key={unit.id}>
                    <div>
                      <h3>{unit.label}</h3>

                      <p>
                        🏠 {unit.bhk
                          ? `${unit.bhk} BHK`
                          : "Rental unit"}
                      </p>

                      <p>
                        👥 Capacity: {unit.capacity} people
                      </p>

                      <p>
                        Optional security deposit amount:{" "}
                        {money(unit.depositAmount)}
                      </p>
                    </div>

                    <div className="pd-unit-actions">
                      <strong>{money(unit.rent)}/month</strong>

                      {!unit.active || Number(unit.availableSlots ?? unit.capacity) <= 0 ? (
                        <span className="pd-hint">Currently unavailable</span>
                      ) : user && user.role !== "TENANT" ? (
                        <span className="pd-hint">Tenant account required</span>
                      ) : (
                        <button className="pd-button" type="button" onClick={() => openBooking(unit.id)}>
                          {user ? "Book Now" : "Sign in & Book"}
                        </button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section className="pd-section">
              <h2>Location</h2>

              <p>
                📍 {property.address}
                {property.locality
                  ? `, ${property.locality}`
                  : ""}
                , {property.city}
              </p>

              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                  `${property.address}, ${property.city}`
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="pd-map-link"
              >
                View location on Google Maps ↗
              </a>
            </section>

          </div>

          <aside className="pd-sidebar">
            <div className="pd-price-card">
              <span>Monthly rent starting from</span>

              <h2>
                {startingRent !== null
                  ? money(startingRent)
                  : "On request"}
              </h2>

              <p>Per month · Rent varies by unit</p>

              <div className="pd-price-divider" />

              <p>
                ✓ Owner-approved booking
              </p>

              <p>
                ✓ Security deposit is optional
              </p>

              <p>
                ✓ Rental agreement during onboarding
              </p>

              <a href="#available-rooms" className="pd-button">
                View Available Rooms
              </a>
            </div>

            <div className="pd-info-card" id="booking-form-info">
              <h3>Before booking</h3>
              <p>
                Tenant email verification and KYC are required.
                All booking requests are subject to Property
                Owner approval.
              </p>
            </div>
          </aside>
        </div>
      </main>

      {selected && user?.role === "TENANT" && (
        <div className="pd-modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) cancelBooking(); }}>
          <section className="pd-booking-modal" role="dialog" aria-modal="true" aria-labelledby="pd-booking-title">
            <div className="pd-modal-heading">
              <div>
                <span className="pd-eyebrow">GOYALNEST / BOOKING</span>
                <h2 id="pd-booking-title">Request a Booking</h2>
                <p>{property.title} · {property.city}</p>
              </div>
              <button className="pd-modal-close" type="button" onClick={cancelBooking} aria-label="Close booking form">×</button>
            </div>
            <form className="pd-booking-form" onSubmit={submitBooking}>
              <div className="pd-selected-room">
                <div>
                  <strong>{selected.label}</strong>
                  <span>{selected.bhk ? `${selected.bhk} BHK · ` : ""}Capacity: {selected.capacity} · Available spaces: {selected.availableSlots ?? "Check with owner"}</span>
                </div>
                <strong>{money(selected.rent)}<small>/month</small></strong>
              </div>
              <div className="pd-form-grid">
                <label className="pd-form-field">Preferred move-in date *
                  <input type="date" min={today} value={moveIn} onChange={e=>setMoveIn(e.target.value)} required />
                </label>
                <label className="pd-form-field">Emergency contact number *
                  <input type="tel" minLength={7} maxLength={18} placeholder="Enter emergency phone" value={emergencyPhone} onChange={e=>setEmergencyPhone(e.target.value)} required />
                </label>
              </div>
              <label className="pd-deposit-choice">
                <input type="checkbox" checked={wantsDeposit} onChange={e=>setWantsDeposit(e.target.checked)} />
                <span>Include optional security deposit ({money(selected.depositAmount)})</span>
              </label>
              <div className="pd-booking-summary">
                <h3>Booking Summary</h3>
                <div><span>Property</span><strong>{property.title}</strong></div>
                <div><span>Selected room</span><strong>{selected.label}</strong></div>
                <div><span>Monthly rent</span><strong>{money(selected.rent)}</strong></div>
                <div><span>Security deposit</span><strong>{wantsDeposit ? money(selected.depositAmount) : "Not selected"}</strong></div>
              </div>
              <p className="pd-booking-note">Your email must be verified and a KYC document must be submitted before requesting a booking. The owner must approve your request; no payment is collected here.</p>
              {bookingError && <div className="pd-booking-error" role="alert">{bookingError}{/KYC/i.test(bookingError) && <><br/><Link to="/dashboard/kyc">Open KYC &amp; Documents</Link></>}</div>}
              <div className="pd-modal-actions">
                <button type="button" className="pd-secondary-button" onClick={cancelBooking}>Cancel</button>
                <button type="submit" className="pd-button" disabled={bookingBusy || !moveIn || !emergencyPhone.trim()}>{bookingBusy ? "Submitting..." : "Submit Booking Request"}</button>
              </div>
            </form>
          </section>
        </div>
      )}

      {bookingSuccess && (
        <div className="pd-modal-backdrop">
          <section className="pd-booking-success" role="dialog" aria-modal="true" aria-labelledby="pd-success-title">
            <div className="pd-success-icon" aria-hidden="true">✓</div>
            <h2 id="pd-success-title">Booking Request Received!</h2>
            <p>Your request has been submitted for the owner's review. This is not a confirmed booking yet.</p>
            <div className="pd-booking-reference"><span>Booking reference</span><strong>{bookingSuccess.id}</strong></div>
            <span className="pd-pending-label">Pending Owner Approval</span>
            <div className="pd-modal-actions">
              <button className="pd-secondary-button" type="button" onClick={()=>setBookingSuccess(null)}>Stay on Property</button>
              <Link className="pd-button" to="/dashboard/bookings">Track in My Bookings</Link>
            </div>
          </section>
        </div>
      )}

      <footer className="pd-footer">
        © {new Date().getFullYear()} GoyalNest · Property & Living
      </footer>
    </div>
  );
}
