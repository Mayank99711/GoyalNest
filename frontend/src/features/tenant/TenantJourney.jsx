import React from "react";
import { Link } from "react-router-dom";
import "./TenantJourney.css";

const list = (value) => (Array.isArray(value) ? value : []);
const dateText = (value) => value ? new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "Not scheduled";

// Booking status and tenancy status are intentionally separate.
export function canCancelBooking(booking) {
  if (!booking || !["PENDING", "APPROVED"].includes(booking.status)) return false;
  const tenancy = booking.tenancy;
  if (!tenancy) return true;
  return tenancy.status === "PENDING_PAYMENT" &&
    !tenancy.checkInAt && !tenancy.checkOutAt && !tenancy.moveOut;
}

export function getRentalStage(booking) {
  const t = booking?.tenancy;
  if (booking?.status === "CANCELLED") return { label: "Cancelled", tone: "muted", title: "Request cancelled", description: "Your cancellation is recorded. Previous booking details remain available.", to: "bookings", action: "View booking history", step: 0 };
  if (booking?.status === "REJECTED") return { label: "Declined", tone: "muted", title: "Booking not approved", description: "You can explore other available properties.", to: "explore", action: "Find another property", step: 0 };
  if (t?.checkOutAt || t?.status === "VACATED") return { label: "Stay completed", tone: "success", title: "Your stay is complete", description: "Your booking remains in history. Cancellation is no longer available.", to: "tenancy", action: "View stay history", step: 4 };
  if (t?.status === "VACATING" || t?.moveOut) return { label: "Moving out", tone: "warning", title: "Move-out in progress", description: "Track the inspection, settlement, and physical checkout steps.", to: "vacate", action: "Track move-out", step: 4 };
  if (t?.checkInAt || t?.status === "ACTIVE") return { label: "Currently staying", tone: "success", title: "Manage your current stay", description: "Your next actions are rent payments, documents, and support requests.", to: "tenancy", action: "Manage stay", step: 3 };
  if (booking?.status === "PENDING") return { label: "Awaiting approval", tone: "warning", title: "Waiting for Owner approval", description: "Your request has been submitted. You will be able to complete move-in requirements after approval.", to: "bookings", action: "Track request", step: 1 };
  if (booking?.status === "APPROVED") {
    const agreementSigned = list(t?.agreements).some((a) => a.signedAt);
    const unpaid = list(t?.invoices).some((i) => !["PAID", "CANCELLED"].includes(i.status));
    if (!agreementSigned) return { label: "Agreement needed", tone: "warning", title: "Review your rental agreement", description: "Your booking was approved. Review the agreement before move-in.", to: "agreements", action: "Review agreement", step: 2 };
    if (unpaid) return { label: "Payment pending", tone: "warning", title: "Review your move-in payment", description: "Review the invoice and use a verified checkout method; an initiated payment is not a paid receipt.", to: "rent", action: "View invoices", step: 2 };
    return { label: "Move-in pending", tone: "neutral", title: "Prepare for your check-in", description: `Your requested move-in date is ${dateText(booking.moveIn)}. Await the authorized check-in confirmation.`, to: "tenancy", action: "View move-in details", step: 2 };
  }
  return { label: "Booking", tone: "neutral", title: "Review booking details", description: "Open your booking to see the latest status.", to: "bookings", action: "View booking", step: 1 };
}

export default function TenantJourney({ bookings, tenancies, compact = false }) {
  const all = list(bookings);
  const current = [...all].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  const live = current.find((b) => b.tenancy?.status === "ACTIVE" || b.tenancy?.status === "VACATING" || b.tenancy?.checkInAt && !b.tenancy?.checkOutAt)
    || current.find((b) => ["PENDING", "APPROVED"].includes(b.status) && !["VACATED", "CANCELLED"].includes(b.tenancy?.status))
    || current[0];
  const stage = live ? getRentalStage(live) : null;
  const milestones = ["Request", "Approval", "Move-in", "Stay", "Move-out"];

  return (
    <section className={`gn-journey ${compact ? "gn-journey-compact" : ""}`} aria-label="Your rental journey">
      <header className="gn-journey-head">
        <div><span className="gn-journey-kicker">YOUR RENTAL JOURNEY</span><h2>{stage ? "Your next step" : "Find your next home"}</h2><p>{live?.unit?.property?.title || "A simple, guided way to rent with GoyalNest"}</p></div>
        {stage && <span className={`gn-journey-pill gn-journey-${stage.tone}`}>{stage.label}</span>}
      </header>
      {stage ? <>
        <div className="gn-journey-progress" aria-label={`Rental journey stage ${stage.step + 1} of 5`}>
          {milestones.map((label, i) => <div className={`gn-journey-step ${i <= stage.step ? "gn-journey-done" : ""}`} key={label}>
            <span className="gn-journey-dot">{i < stage.step ? "✓" : i + 1}</span><span>{label}</span>
          </div>)}
        </div>
        <div className="gn-journey-next"><div><h3>{stage.title}</h3><p>{stage.description}</p></div>{stage.to === "bookings" ? (
  <a
    className="gn-journey-button"
    href="#booking-history"
    onClick={(event) => {
      const target = document.getElementById("booking-history");

      if (target) {
        event.preventDefault();

        target.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });

        target.focus({ preventScroll: true });
      }
    }}
  >
    {stage.action} <span aria-hidden="true">↗</span>
  </a>
) : (
  <Link
    className="gn-journey-button"
    to={`/dashboard/${stage.to}`}
  >
    {stage.action} <span aria-hidden="true">↗</span>
  </Link>
)}</div>
      </> : <div className="gn-journey-next"><div><h3>No bookings yet</h3><p>Explore published properties and schedule a visit before making a booking request.</p></div><Link className="gn-journey-button" to="/properties">Explore properties ↗</Link></div>}
      {!compact && live && <nav className="gn-journey-links" aria-label="Helpful tenant pages"><Link to="/dashboard/agreements">Agreements</Link><Link to="/dashboard/rent">Rent & payments</Link><Link to="/dashboard/kyc">KYC & documents</Link><Link to="/dashboard/vacate">Move-out</Link></nav>}
    </section>
  );
}
