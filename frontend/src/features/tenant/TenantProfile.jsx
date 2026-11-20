import React, { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { useAuth } from "../../app/AuthContext";
import "./TenantPortal.css";

export default function TenantProfile() {
  const { refresh } = useAuth();
  const [profile, setProfile] = useState({ name: "", phone: "", email: "" });
  const [password, setPassword] = useState({ currentPassword: "", newPassword: "", confirm: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    let active = true;
    api("/tenant-portal/profile").then(d => { if (active) setProfile(d.profile); })
      .catch(e => { if (active) setError(e.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function saveProfile(event) {
    event.preventDefault(); setSaving("profile"); setError(""); setNotice("");
    try {
      const d = await api("/tenant-portal/profile", { method: "PATCH", body: { name: profile.name, phone: profile.phone } });
      setProfile(d.profile); await refresh(); setNotice(d.message);
    } catch(e) { setError(e.message); } finally { setSaving(""); }
  }
  async function savePassword(event) {
    event.preventDefault();
    if (password.newPassword !== password.confirm) { setError("New passwords do not match"); return; }
    setSaving("password"); setError(""); setNotice("");
    try {
      const d = await api("/tenant-portal/password", { method: "POST", body: { currentPassword: password.currentPassword, newPassword: password.newPassword } });
      setPassword({ currentPassword: "", newPassword: "", confirm: "" }); setNotice(d.message);
    } catch(e) { setError(e.message); } finally { setSaving(""); }
  }
  return <main className="tp-page">
    <header className="tp-heading"><span>MY ACCOUNT</span><h2>Profile & Settings</h2><p>Manage your personal information and login security.</p></header>
    {error && <div className="tp-alert" role="alert">{error}</div>}
    {notice && <div className="tp-success" role="status">{notice}</div>}
    {loading ? <p>Loading profile...</p> : <div className="tp-grid">
      <form className="tp-panel tp-form" onSubmit={saveProfile}>
        <h3>Personal Information</h3>
        <label>Full name<input value={profile.name || ""} maxLength={100} required minLength={2} onChange={e => setProfile(p => ({...p,name:e.target.value}))}/></label>
        <label>Email address<input value={profile.email || ""} disabled/><small>Email changes require a separate verification process.</small></label>
        <label>Phone number<input type="tel" value={profile.phone || ""} maxLength={20} onChange={e => setProfile(p => ({...p,phone:e.target.value}))}/></label>
        <button className="tp-button" disabled={!!saving}>{saving === "profile" ? "Saving..." : "Save Changes"}</button>
      </form>
      <form className="tp-panel tp-form" onSubmit={savePassword}>
        <h3>Security</h3>
        <label>Current password<input type="password" autoComplete="current-password" required value={password.currentPassword} onChange={e => setPassword(p => ({...p,currentPassword:e.target.value}))}/></label>
        <label>New password<input type="password" minLength={10} maxLength={128} autoComplete="new-password" required value={password.newPassword} onChange={e => setPassword(p => ({...p,newPassword:e.target.value}))}/></label>
        <label>Confirm new password<input type="password" minLength={10} autoComplete="new-password" required value={password.confirm} onChange={e => setPassword(p => ({...p,confirm:e.target.value}))}/></label>
        <p className="tp-hint">Use at least 10 characters. Never share your password.</p>
        <button className="tp-button" disabled={!!saving}>{saving === "password" ? "Updating..." : "Change Password"}</button>
      </form>
    </div>}
  </main>;
}
