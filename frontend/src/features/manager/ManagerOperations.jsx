
import React, { useEffect, useState } from "react";
import { api } from "../../lib/api";
import "./ManagerOperations.css";

const currency = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value || 0);

function Stat({ label, value }) {
  return (
    <div className="mgr-stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export default function ManagerOperations({
  page = "overview",
}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [propertyId, setPropertyId] = useState("");
  const physicalRooms = data?.physical?.rooms || [];
const physicalSummary = data?.physical?.summary || {};

const physicalRoomMap = new Map(
  physicalRooms.map((room) => [room.unitId, room])
);
  async function load() {
  setLoading(true);

  try {
    const [summary, physical] = await Promise.all([
      api("/manager-portal/summary"),
      api("/manager-portal/physical-occupancy"),
    ]);

    setData({
      ...summary,
      physical,
    });

    setError("");
  } catch (err) {
    setError(err.message);
  } finally {
    setLoading(false);
  }
}

  useEffect(() => {
    load();
  }, []);

  const summary = data?.summary || {};
  const properties = data?.properties || [];
  const rooms = data?.rooms || [];

  const filteredRooms = rooms.filter((room) => {
    if (propertyId && room.propertyId !== propertyId) {
      return false;
    }

    const q = search.toLowerCase().trim();
    return (
      room.label.toLowerCase().includes(q) ||
      room.property.toLowerCase().includes(q) ||
      room.occupants.some((o) =>
        o.name.toLowerCase().includes(q)
      )
    );
  });

  return (
    <div className="manager-operations">
      <div className="mgr-heading">
        <div>
          <h2>
            {page === "overview"
              ? "Manager Overview"
              : page === "properties"
                ? "Assigned Properties"
                : "Rooms & Occupancy"}
          </h2>
          <p>
            {page === "overview"
              ? "Operational summary of your assigned properties."
              : page === "properties"
                ? "Manage and monitor the properties assigned to you."
                : "View rooms, occupancy and available capacity."}
          </p>
        </div>

        <button
          type="button"
          className="btn outline"
          onClick={load}
          disabled={loading}
        >
          Refresh
        </button>
      </div>

      {error && (
        <p role="alert" className="notice">
          {error}
        </p>
      )}

      {loading && <p>Loading manager data...</p>}

      {!loading && data && (
        <>
          {page === "overview" && (
            <>
              <div className="mgr-stats">
                <Stat
                  label="Assigned Properties"
                  value={summary.assignedProperties}
                />
                <Stat
                  label="Total Rooms"
                  value={summary.totalRooms}
                />
                <Stat
  label="Confirmed Occupants"
  value={physicalSummary.confirmedOccupied ?? 0}
/>

<Stat
  label="Available Physical Capacity"
  value={physicalSummary.availableCapacity ?? 0}
/>

<Stat
  label="Awaiting Check-in"
  value={physicalSummary.awaitingCheckIn ?? 0}
/>
                <Stat
                  label="Active Tenancies"
                  value={summary.activeTenancies}
                />
                <Stat
                  label="Vacating Tenancies"
                  value={summary.vacatingTenancies}
                />
                <Stat
                  label="Open Maintenance"
                  value={summary.openMaintenance}
                />
                <Stat
                  label="Outstanding Invoices"
                  value={summary.outstandingInvoiceCount}
                />
              </div>

              <section className="mgr-panel">
                <h3>Property Overview</h3>

                {properties.length === 0 && (
                  <p>
                    No properties assigned yet.
                    Contact your Property Owner.
                  </p>
                )}


{properties.map((property) => {
  const propertyPhysical = physicalRooms.filter(
    (room) => room.propertyId === property.id
  );

  const propertyCapacity = propertyPhysical.reduce(
    (sum, room) => sum + room.capacity,
    0
  );

  const propertyOccupied = propertyPhysical.reduce(
    (sum, room) => sum + room.confirmedOccupied,
    0
  );

  const occupancyRate = propertyCapacity
    ? Math.round((propertyOccupied / propertyCapacity) * 100)
    : 0;

  return (
    <div
      className="mgr-property-row"
      key={property.id}
    >
      <div>
        <strong>{property.title}</strong>
        <p>
          {property.city} · {property.units} rooms
        </p>
      </div>

      <strong>
        {occupancyRate}% occupied
      </strong>
    </div>
  );
})}

              </section>
            </>
          )}

          {page === "properties" && (
            <div className="mgr-property-grid">
              {properties.length === 0 && (
                <section className="mgr-panel">
                  No properties assigned.
                </section>
              )}


{properties.map((p) => {
  const propertyPhysical = physicalRooms.filter(
    (room) => room.propertyId === p.id
  );

  const propertyCapacity = propertyPhysical.reduce(
    (sum, room) => sum + room.capacity,
    0
  );

  const propertyOccupied = propertyPhysical.reduce(
    (sum, room) => sum + room.confirmedOccupied,
    0
  );

  const occupancyRate = propertyCapacity
    ? Math.round((propertyOccupied / propertyCapacity) * 100)
    : 0;

  return (
    <section className="mgr-panel" key={p.id}>
      <h3>{p.title}</h3>
      <p>{p.address}</p>
      <p>
        {p.locality}, {p.city}
      </p>

      <div className="mgr-details">
        <span>Listing</span>
        <strong>{p.status}</strong>
        <span>Rooms</span>
        <strong>{p.units}</strong>
        <span>Capacity</span>
        <strong>{propertyCapacity}</strong>
        <span>Occupied</span>
        <strong>{propertyOccupied}</strong>
        <span>Available</span>
        <strong>{propertyCapacity - propertyOccupied}</strong>
      </div>

      <div className="mgr-progress">
        <div
          style={{
            width: `${occupancyRate}%`,
          }}
        />
      </div>

      <small>{occupancyRate}% occupancy</small>
    </section>
  );
})}

            </div>
          )}

          {page === "rooms" && (
            <section className="mgr-panel">
              <div className="mgr-filters">
                <select
                  value={propertyId}
                  onChange={(e) =>
                    setPropertyId(e.target.value)
                  }
                >
                  <option value="">All Properties</option>
                  {properties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </select>

                <input
                  type="search"
                  placeholder="Search room or tenant..."
                  value={search}
                  onChange={(e) =>
                    setSearch(e.target.value)
                  }
                />
              </div>

              <div className="mgr-room-grid">
                {filteredRooms.length === 0 && (
                  <p>No matching rooms found.</p>
                )}

                {filteredRooms.map((room) => {
  const physical = physicalRoomMap.get(room.id);

  return (
                  <article
                    key={room.id}
                    className="mgr-room-card"
                  >
                    <div className="mgr-room-top">
                      <strong>{room.label}</strong>
                      <span>
                        {!room.active
  ? "Inactive"
  : (physical?.availableCapacity ?? 0) > 0
    ? "Physical Space Available"
    : "Physically Full"}
                      </span>
                    </div>

                    <p>{room.property}</p>

                    <div className="mgr-details">
                      <span>Monthly Rent</span>
                      <strong>{currency(room.rent)}</strong>
                      <span>Capacity</span>
                      <strong>{room.capacity}</strong>
                      <span>Occupied</span>
                      <strong>{physical?.confirmedOccupied ?? 0}</strong>
                      <span>Available</span>
                      <strong>{physical?.availableCapacity ?? 0}</strong>
                    </div>

                    <h4>Confirmed Physical Occupants</h4>

{!physical?.occupants?.length ? (
  <p>No confirmed physical occupants.</p>
) : (
  physical.occupants.map((occupant) => (
    <div
      className="mgr-occupant"
      key={occupant.tenancyId}
    >
      <span>{occupant.tenant}</span>
      <small>Checked In</small>
    </div>
  ))
)}
                  </article>
  );
})}
              </div>
            </section>
          )}
        </>
      )}

      {page === "rooms" && (
  <p className="mgr-note">
    Occupancy is calculated using confirmed physical
    room occupancy. Awaiting check-in tenants are not
    counted as physically occupied.
  </p>
)}
    </div>
  );
}
