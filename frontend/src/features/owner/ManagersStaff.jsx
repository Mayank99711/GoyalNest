
import React, { useState } from "react";
import { Card, Form, Empty, Pill, useRemote } from "../../components/UI";
import { api } from "../../lib/api";

export default function ManagersStaff() {
  const {
    data: properties,
    reload: reloadProperties,
  } = useRemote("/properties/mine");

  const {
    data: assignments,
    error,
    busy,
    reload,
  } = useRemote("/team");

  const [search, setSearch] = useState("");
  const [workingId, setWorkingId] = useState(null);
  const [message, setMessage] = useState("");

  const propertyList = Array.isArray(properties) ? properties : [];
  const assignmentList = Array.isArray(assignments) ? assignments : [];

  const filtered = assignmentList.filter((item) => {
    const term = search.toLowerCase().trim();
    return (
      item.manager?.name?.toLowerCase().includes(term) ||
      item.manager?.email?.toLowerCase().includes(term) ||
      item.property?.title?.toLowerCase().includes(term)
    );
  });

  async function revokeAssignment(item) {
    if (!window.confirm(
      `Remove ${item.manager?.name} from ${item.property?.title}?`
    )) return;

    setWorkingId(item.id);
    setMessage("");

    try {
      await api(`/team/assignment/${item.id}`, {
        method: "DELETE",
      });

      setMessage("Manager assignment removed successfully.");
      reload();
    } catch (err) {
      setMessage(err.message);
    } finally {
      setWorkingId(null);
    }
  }

  return (
    <div className="dashboard-grid">
      <div className="stats">
        <div>
          <span>My Properties</span>
          <strong>{propertyList.length}</strong>
        </div>
        <div>
          <span>Manager Assignments</span>
          <strong>{assignmentList.length}</strong>
        </div>
        <div>
          <span>Unique Managers</span>
          <strong>
            {new Set(assignmentList.map(x => x.managerId)).size}
          </strong>
        </div>
      </div>

      <Card
        title="Create & Appoint Property Manager"
        desc="Only the Property Owner can create or appoint managers. Email OTP is not required."
      >
        {propertyList.length === 0 ? (
          <Empty text="Create a property before appointing a manager." />
        ) : (
          <Form
            endpoint="/team/appoint"
            submit="Create & Appoint Manager"
            after={() => {
              reload();
              reloadProperties();
            }}
            fields={[
              {
                name: "propertyId",
                label: "Assign to Property",
                required: true,
                options: propertyList.map(p => ({
                  value: p.id,
                  label: p.title,
                })),
              },
              {
                name: "name",
                label: "Manager Full Name",
                required: true,
              },
              {
                name: "email",
                label: "Manager Email",
                type: "email",
                required: true,
              },
              {
                name: "phone",
                label: "Phone Number (Optional)",
                type: "tel",
              },
              {
                name: "password",
                label: "Temporary Password (10+ characters)",
                type: "password",
                required: true,
              },
            ]}
          />
        )}
      </Card>

      <Card
        title="Assigned Property Managers"
        desc="View managers and revoke their property access."
      >
        <input
          type="search"
          placeholder="Search manager or property..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            width: "100%",
            padding: "12px",
            marginBottom: "16px",
            borderRadius: "8px",
            border: "1px solid #ddd",
          }}
        />

        {busy && <p>Loading assignments...</p>}
        {error && <p className="error">{error}</p>}
        {message && <p>{message}</p>}

        {!busy && !error && filtered.length === 0 && (
          <Empty text="No manager assignments found." />
        )}

        <div className="record-list">
          {filtered.map(item => (
            <div className="record" key={item.id}>
              <div>
                <b>{item.manager?.name}</b>
                <p className="muted">{item.manager?.email}</p>
                <p className="muted">
                  Assigned to: {item.property?.title}
                </p>
                <Pill>Assigned</Pill>
              </div>

              <button
                className="btn outline"
                disabled={workingId === item.id}
                onClick={() => revokeAssignment(item)}
              >
                {workingId === item.id
                  ? "Removing..."
                  : "Revoke Assignment"}
              </button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
