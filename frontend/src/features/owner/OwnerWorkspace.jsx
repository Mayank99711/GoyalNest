import React, { useEffect, useState } from "react";
import { api } from "../../lib/api";
import "./OwnerWorkspace.css";
import OwnerBedInventory from "./OwnerBedInventory";

const cash = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;
const day = (d) =>
  d
    ? new Date(d).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "—";
const Button = ({ children, secondary, ...props }) => (
  <button
    className={`ow-btn ${secondary ? "ow-secondary" : "ow-primary"}`}
    {...props}
  >
    {children}
  </button>
);
function useOwnerData(path, refreshKey = 0) {
  const [state, setState] = useState({ data: null, loading: true, error: "" });
  useEffect(() => {
    let active = true;
    setState((s) => ({ ...s, loading: true, error: "" }));
    api(path)
      .then((data) => {
        if (active) setState({ data, loading: false, error: "" });
      })
      .catch((e) => {
        if (active) setState({ data: null, loading: false, error: e.message });
      });
    return () => {
      active = false;
    };
  }, [path, refreshKey]);
  return state;
}
function Feedback({ error, success }) {
  return (
    <>
      {error && (
        <p className="ow-alert ow-error" role="alert">
          {error}
        </p>
      )}
      {success && (
        <p className="ow-alert ow-success" role="status">
          {success}
        </p>
      )}
    </>
  );
}
function Modal({ title, children, onClose }) {
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function escape(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", escape);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", escape);
    };
  }, [onClose]);
  return (
    <div
      className="ow-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <section
        className="ow-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="ow-modal-head">
          <h3>{title}</h3>
          <button type="button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <div className="ow-modal-body">{children}</div>
      </section>
    </div>
  );
}
function Empty({ children }) {
  return <div className="ow-empty">{children}</div>;
}
function Metric({ label, value }) {
  return (
    <div className="ow-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function OwnerUnits() {
  const [version, setVersion] = useState(0);
  const { data, loading, error } = useOwnerData(
    "/owner-workspace/units",
    version,
  );
  const properties = useOwnerData("/properties/mine", version);
  const [edit, setEdit] = useState(null);
  const [bedsUnit, setBedsUnit] = useState(null);
  const [createProperty, setCreateProperty] = useState("");
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const units = data?.units || [];
  const propertyList = Array.isArray(properties.data) ? properties.data : [];
  function openNew() {
    setCreateProperty(propertyList[0]?.id || "");
    setForm({
      label: "",
      bhk: "",
      capacity: 1,
      rent: "",
      depositAmount: 0,
      active: true,
    });
    setEdit({ mode: "create" });
    setActionError("");
  }
  function openEdit(unit) {
    setForm({
      label: unit.label,
      bhk: unit.bhk ?? "",
      capacity: unit.capacity,
      rent: unit.rent,
      depositAmount: unit.depositAmount,
      active: unit.active,
    });
    setEdit({ mode: "edit", unit });
    setActionError("");
  }
  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    if (!edit) return;
    const payload = {
      label: form.label.trim(),
      bhk: form.bhk === "" ? null : Number(form.bhk),
      capacity: Number(form.capacity),
      rent: Number(form.rent),
      depositAmount: Number(form.depositAmount),
      active: !!form.active,
    };
    if (
      !payload.label ||
      !Number.isInteger(payload.capacity) ||
      payload.capacity < 1 ||
      !Number.isInteger(payload.rent) ||
      payload.rent <= 0 ||
      !Number.isInteger(payload.depositAmount) ||
      payload.depositAmount < 0
    ) {
      setActionError("Enter a valid unit label, capacity, rent and deposit.");
      return;
    }
    setBusy(true);
    setActionError("");
    try {
      if (edit.mode === "create") {
        if (!createProperty) throw new Error("Select a property first");
        const { active, ...createPayload } = payload;
        await api(`/properties/${createProperty}/units`, {
          method: "POST",
          body: createPayload,
        });
      } else {
        await api(`/owner-workspace/units/${edit.unit.id}`, {
          method: "PATCH",
          body: payload,
        });
      }
      setNotice(
        edit.mode === "create"
          ? "Unit added successfully."
          : "Unit updated successfully.",
      );
      setEdit(null);
      setVersion((v) => v + 1);
    } catch (err) {
      setActionError(err.message);
    } finally {
      setBusy(false);
    }
  };
  async function removeUnit(unit) {
    if (
      !window.confirm(
        `Delete unused unit ${unit.label}? Units with history cannot be deleted.`,
      )
    )
      return;
    try {
      await api(`/owner-workspace/units/${unit.id}`, { method: "DELETE" });
      setNotice("Unit deleted.");
      setVersion((v) => v + 1);
    } catch (err) {
      setNotice("");
      setActionError(err.message);
    }
  }
  return (
    <div className="ow-page">
      <header className="ow-heading">
        <div>
          <h2>Rooms, Beds & Units</h2>
          <p>Manage rentable units, capacity, pricing and availability.</p>
        </div>
        <Button onClick={openNew} disabled={!propertyList.length}>
          + Add Unit
        </Button>
      </header>
      <Feedback
        error={error || properties.error || (!edit && actionError)}
        success={notice}
      />
      <div className="ow-metrics">
        <Metric label="Total Units" value={data?.totals?.units ?? "—"} />
        <Metric label="Active Capacity" value={data?.totals?.capacity ?? "—"} />
        <Metric label="Occupied" value={data?.totals?.occupied ?? "—"} />
        <Metric label="Available" value={data?.totals?.available ?? "—"} />
      </div>
      <div className="ow-card">
        <div className="ow-card-head">
          <h3>Unit Inventory</h3>
          <span>{units.length} units</span>
        </div>
        <div className="ow-scroll">
          <table className="ow-table">
            <thead>
              <tr>
                <th>Property / Unit</th>
                <th>Capacity</th>
                <th>Occupied</th>
                <th>Available</th>
                <th>Monthly Rent</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {units.map((u) => (
                <tr key={u.id}>
                  <td>
                    <strong>{u.property.title}</strong>
                    <small>
                      {u.label}
                      {u.bhk !== null ? ` · ${u.bhk} BHK` : ""}
                    </small>
                  </td>
                  <td>{u.capacity}</td>
                  <td>{u.occupied}</td>
                  <td>{u.available}</td>
                  <td>{cash(u.rent)}</td>
                  <td>
                    <span
                      className={`ow-pill ${u.active ? "ow-ok" : "ow-muted"}`}
                    >
                      {u.active ? "ACTIVE" : "INACTIVE"}
                    </span>
                  </td>
                  <td>
                    <div className="ow-actions">
                      <Button secondary onClick={() => openEdit(u)}>
                        Manage
                      </Button>
                      <Button secondary onClick={() => setBedsUnit(u)}>
                        Beds
                      </Button>
                      {!u._count.bookings && !u._count.tenancies && (
                        <Button secondary onClick={() => removeUnit(u)}>
                          Delete
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {loading && <Empty>Loading units...</Empty>}
        {!loading && !units.length && (
          <Empty>No units found. Add a unit to one of your properties.</Empty>
        )}
      </div>
      <p className="ow-hint">
        Capacity controls booking availability. Use Beds to configure physical bed labels and assign existing tenancies.
      </p>
      {bedsUnit && <OwnerBedInventory unit={bedsUnit} onClose={() => setBedsUnit(null)} />}
      {edit && (
        <Modal
          title={
            edit.mode === "create" ? "Add Rental Unit" : "Manage Rental Unit"
          }
          onClose={() => !busy && setEdit(null)}
        >
          <form onSubmit={submit} className="ow-form">
            <Feedback error={actionError} />
            {edit.mode === "create" && (
              <label>
                Property
                <select
                  value={createProperty}
                  onChange={(e) => setCreateProperty(e.target.value)}
                  required
                >
                  {propertyList.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              Room / Unit Number
              <input
                value={form.label || ""}
                onChange={(e) =>
                  setForm((f) => ({ ...f, label: e.target.value }))
                }
                maxLength={80}
                required
              />
            </label>
            <div className="ow-form-grid">
              <label>
                BHK (optional)
                <input
                  type="number"
                  min="0"
                  max="20"
                  value={form.bhk ?? ""}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, bhk: e.target.value }))
                  }
                />
              </label>
              <label>
                Capacity / Beds
                <input
                  type="number"
                  min="1"
                  value={form.capacity}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, capacity: e.target.value }))
                  }
                  required
                />
              </label>
              <label>
                Rent (₹/month)
                <input
                  type="number"
                  min="1"
                  value={form.rent}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, rent: e.target.value }))
                  }
                  required
                />
              </label>
              <label>
                Security Deposit (₹)
                <input
                  type="number"
                  min="0"
                  value={form.depositAmount}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, depositAmount: e.target.value }))
                  }
                  required
                />
              </label>
            </div>
            {edit.mode === "edit" && (
              <label className="ow-check">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, active: e.target.checked }))
                  }
                />{" "}
                Active for booking
              </label>
            )}
            <footer className="ow-form-actions">
              <Button
                secondary
                type="button"
                onClick={() => setEdit(null)}
                disabled={busy}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? "Saving..." : "Save Unit"}
              </Button>
            </footer>
          </form>
        </Modal>
      )}
    </div>
  );
}

export function OwnerTenants() {
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState(null);
  const { data, loading, error } = useOwnerData(
    `/owner-workspace/tenants?page=${page}${filter ? `&status=${filter}` : ""}`,
  );
  const tenancies = data?.tenancies || [];
  return (
    <div className="ow-page">
      <header className="ow-heading">
        <div>
          <h2>Tenant Management</h2>
          <p>Tenants connected to your properties through tenancy records.</p>
        </div>
      </header>
      <Feedback error={error} />
      <div className="ow-metrics">
        <Metric label="Matching Tenancies" value={data?.total ?? "—"} />
        <Metric label="Current Page" value={page} />
      </div>
      <div className="ow-card">
        <div className="ow-card-head">
          <h3>Tenant Directory</h3>
          <select
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            {[
              "ACTIVE",
              "PENDING_PAYMENT",
              "VACATING",
              "VACATED",
              "CANCELLED",
            ].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="ow-scroll">
          <table className="ow-table">
            <thead>
              <tr>
                <th>Tenant</th>
                <th>Property / Unit</th>
                <th>Tenancy</th>
                <th>Rent</th>
                <th>Start Date</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {tenancies.map((t) => (
                <tr key={t.id}>
                  <td>
                    <strong>{t.tenant.name}</strong>
                    <small>{t.tenant.email}</small>
                  </td>
                  <td>
                    <strong>{t.unit.property.title}</strong>
                    <small>{t.unit.label}</small>
                  </td>
                  <td>
                    <span className="ow-pill ow-muted">{t.status}</span>
                  </td>
                  <td>{cash(t.rent)}</td>
                  <td>{day(t.startDate)}</td>
                  <td>
                    <Button secondary onClick={() => setSelected(t)}>
                      Details
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {loading && <Empty>Loading tenant records...</Empty>}
        {!loading && !tenancies.length && (
          <Empty>No matching tenant records.</Empty>
        )}
        <footer className="ow-pagination">
          <Button
            secondary
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </Button>
          <span>
            Page {page} of {data?.totalPages || 1}
          </span>
          <Button
            secondary
            disabled={page >= (data?.totalPages || 1)}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </footer>
      </div>
      {selected && (
        <Modal
          title="Tenant & Tenancy Details"
          onClose={() => setSelected(null)}
        >
          <div className="ow-detail-grid">
            {[
              ["Name", selected.tenant.name],
              ["Email", selected.tenant.email],
              ["Phone", selected.tenant.phone || "—"],
              ["Property", selected.unit.property.title],
              ["Unit", selected.unit.label],
              ["Status", selected.status],
              ["Monthly rent", cash(selected.rent)],
              ["Deposit paid", cash(selected.depositPaid)],
              ["Deposit required", cash(selected.depositRequired)],
              ["Start date", day(selected.startDate)],
            ].map(([key, val]) => (
              <div key={key}>
                <span>{key}</span>
                <strong>{val}</strong>
              </div>
            ))}
          </div>
          <h4>Recent Rent Invoices</h4>
          <div className="ow-scroll">
            <table className="ow-table">
              <thead>
                <tr>
                  <th>Period</th>
                  <th>Amount</th>
                  <th>Due</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {selected.invoices.map((i) => (
                  <tr key={i.id}>
                    <td>{i.period}</td>
                    <td>{cash(i.amount + i.penalty)}</td>
                    <td>{day(i.dueDate)}</td>
                    <td>{i.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!selected.invoices.length && (
            <Empty>No invoices for this tenancy.</Empty>
          )}
        </Modal>
      )}
    </div>
  );
}

export function OwnerSubscription() {
  const [version, setVersion] = useState(0);
  const { data, loading, error } = useOwnerData(
    "/owner-workspace/subscription",
    version,
  );
  const plans = useOwnerData("/subscriptions/plans");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState("");
  const active = data?.active;
  const latest = data?.latest;
  async function demoActivate(plan) {
    if (
      !window.confirm(
        `Create a DEMO ${plan} subscription? This does NOT charge money and may create another subscription record.`,
      )
    )
      return;
    setBusy(true);
    setActionError("");
    setNotice("");
    try {
      const result = await api("/subscriptions/demo-activate", {
        method: "POST",
        body: { plan },
      });
      setNotice(
        `Demo subscription created (${result.paymentMode || "DEMO_ONLY"}).`,
      );
      setVersion((v) => v + 1);
    } catch (e) {
      setActionError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="ow-page">
      <header className="ow-heading">
        <div>
          <h2>My Subscription</h2>
          <p>Your current plan, listing entitlement and expiry information.</p>
        </div>
      </header>
      <Feedback error={error || plans.error || actionError} success={notice} />
      {loading ? (
        <Empty>Loading subscription...</Empty>
      ) : (
        <>
          <div className="ow-metrics">
            <Metric
              label="Current Plan"
              value={active?.plan || "No active plan"}
            />
            <Metric label="Entitlement" value={active?.listingLimit ?? "—"} />
            <Metric label="Used Listings" value={data?.usedListings ?? "—"} />
            <Metric
              label="Available Listings"
              value={data?.availableListings ?? 0}
            />
          </div>
          <div className="ow-card ow-pad">
            <div className="ow-sub-status">
              <div>
                <h3>Subscription Overview</h3>
                <p>
                  {active
                    ? "Your current subscription is active."
                    : "No active subscription found."}
                </p>
              </div>
              <span className={`ow-pill ${active ? "ow-ok" : "ow-muted"}`}>
                {data?.status || "UNKNOWN"}
              </span>
            </div>
            <div className="ow-detail-grid">
              {[
                ["Plan", active?.plan || latest?.plan || "—"],
                ["Plan price", latest ? cash(latest.price) : "—"],
                ["Expiry", day(active?.expiresAt || latest?.expiresAt)],
                ["Created", day(latest?.createdAt)],
                ["Listing limit", active?.listingLimit ?? "—"],
                ["Used listing slots", data?.usedListings ?? 0],
              ].map(([key, val]) => (
                <div key={key}>
                  <span>{key}</span>
                  <strong>{val}</strong>
                </div>
              ))}
            </div>
            <p className="ow-hint">
              Listing slots count PENDING and PUBLISHED properties. Admin
              changes appear after refresh. Paid renewal/payment processing is
              not implemented here.
            </p>
            <Button secondary onClick={() => setVersion((v) => v + 1)}>
              Refresh Subscription
            </Button>
          </div>
          {data?.isDemoBilling && (
          <div className="ow-card ow-pad">
            <h3>Available Plans (Demo Only)</h3>
            <p className="ow-hint">
              These buttons invoke your existing demo activation endpoint. They
              do not collect payment; avoid using them for production billing.
            </p>
            <div className="ow-plan-grid">
              {Object.entries(plans.data || {}).map(([name, plan]) => (
                <div key={name} className="ow-plan">
                  <h4>{name}</h4>
                  <strong>{cash(plan.price)}</strong>
                  <p>{plan.limit} listing slots</p>
                  <Button
                    secondary
                    disabled={busy}
                    onClick={() => demoActivate(name)}
                  >
                    Activate demo plan
                  </Button>
                </div>
              ))}
            </div>
          </div>
          )}
        </>
      )}
    </div>
  );
}
