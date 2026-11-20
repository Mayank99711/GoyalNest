
import React from "react";
import { Link } from "react-router-dom";
import {
  Card,
  DataList,
  Pill,
  Action,
  useRemote
} from "../../components/UI";

import TenantJourney, { canCancelBooking, getRentalStage } from "./TenantJourney";
import "./MyBookingsV6.css";
export default function MyBookings() {
  const {
    data,
    busy,
    error,
    reload
  } = useRemote("/bookings/mine");

  const bookings = Array.isArray(data) ? [...data].sort((a,b)=>new Date(b.createdAt||0)-new Date(a.createdAt||0)) : [];

  const pending = bookings.filter(
    b => b.status === "PENDING"
  );

  const approved = bookings.filter(
    b => b.status === "APPROVED"
  );

  return (
    <div className="dashboard-grid">
      <TenantJourney bookings={bookings} />
      <div className="stats">
        <div>
          <span>Total Bookings</span>
          <strong>{bookings.length}</strong>
        </div>

        <div>
          <span>Pending</span>
          <strong>{pending.length}</strong>
        </div>

        <div>
          <span>Approved</span>
          <strong>{approved.length}</strong>
        </div>
      </div>

      <section id="booking-history" tabIndex={-1}>
      <div className="gnb-toolbar"><div><h2>Booking History</h2><p>Review the latest owner decisions and your next steps.</p></div><button className="btn outline" type="button" onClick={reload} disabled={busy}>↻ Refresh status</button></div>
  <Card
    title="Booking History"
    desc="View your current, completed and cancelled bookings."
  >
        {busy && <p>Loading bookings...</p>}

        {error && <p className="error">{error}</p>}

        {!busy && !error && bookings.length === 0 && (
          <div className="empty">
            <h3>No bookings yet</h3>
            <p>
              Explore properties and request your first stay.
            </p>
            <Link to="/properties" className="btn primary">
              Explore Properties
            </Link>
          </div>
        )}

        {!busy && !error && (
          <DataList
            items={bookings}
            empty="No booking requests available."
            render={booking => (
              <>
                <div>
                  <h3>
                    {booking.unit?.property?.title ||
                      "Property"}
                  </h3>

                  <p className="muted">
                    Room: {booking.unit?.label || "N/A"}
                  </p>

                  <p>
                    Move-in:{" "}
                    {new Date(
                      booking.moveIn
                    ).toLocaleDateString("en-IN")}
                  </p>

                  <p>
                    Deposit selected:{" "}
                    {booking.wantsDeposit ? "Yes" : "No"}
                  </p>

                  <Pill>{booking.status}</Pill>
                  <p className="gnb-ref">Reference: {booking.id}</p>
                  <p className="gnb-stage"><strong>{getRentalStage(booking).title}</strong> — {getRentalStage(booking).description}</p>
                </div>

                {canCancelBooking(booking) &&
  (!booking.tenancy ||
    (
      booking.tenancy.status === "PENDING_PAYMENT" &&
      !booking.tenancy.checkInAt &&
      !booking.tenancy.checkOutAt
    )) && (
    <Action
      path={`/bookings/${booking.id}/cancel`}
      onDone={reload}
    >
      Cancel Booking
    </Action>
)}
              </>
            )}
          />
        )}
      </Card>
      </section>
    </div>
  );
}
