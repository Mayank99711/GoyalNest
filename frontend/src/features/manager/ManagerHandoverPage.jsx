
import React, { useState } from "react";
import ManagerCheckIn from "./ManagerCheckIn";
import ManagerCheckoutInspection from "./ManagerCheckoutInspection";

export default function ManagerHandoverPage() {
  const [tab, setTab] = useState("checkin");

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <button
          type="button"
          className={`btn ${tab === "checkin" ? "primary" : "outline"}`}
          onClick={() => setTab("checkin")}
        >
          Check-in
        </button>

        <button
          type="button"
          className={`btn ${tab === "checkout" ? "primary" : "outline"}`}
          onClick={() => setTab("checkout")}
        >
          Check-out Inspection
        </button>
      </div>

      {tab === "checkin" ? (
        <ManagerCheckIn />
      ) : (
        <ManagerCheckoutInspection />
      )}
    </div>
  );
}
