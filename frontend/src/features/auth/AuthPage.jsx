
import React, { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../app/AuthContext";
import { api } from "../../lib/api";

const roles = [
  ["TENANT", "Tenant"],
  ["OWNER", "Property Owner"],
  ["MANAGER", "Property Manager"],
  ["ADMIN", "Super Admin"],
];

export default function AuthPage({ mode = "login" }) {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const bookingReturn = location.state?.bookingReturn;
  const [role, setRole] = useState("TENANT");
  const [name, setName] = useState("");
  const [email, setEmail] = useState(location.state?.email || "");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [otp, setOtp] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const isLogin = mode === "login";
  const isRegister = mode === "register";
  const isVerify = mode === "verify";

  async function submit(e) {
    e.preventDefault();
    if (isRegister && (password.length < 8 || password.length > 128)) {
      setStatus("Password must contain between 8 and 128 characters.");
      return;
    }
    setBusy(true);
    setStatus("");

    try {
      if (isLogin) {
        const loggedIn = await login(email, password, role);
        if (bookingReturn && loggedIn.role === "TENANT") {
          navigate(`/properties/${encodeURIComponent(bookingReturn.propertyId)}`, {
            replace: true, state: { openBookingUnitId: bookingReturn.unitId }
          });
        } else {
          navigate("/dashboard", { replace: true });
        }
        return;
      }

      if (isRegister) {
        const result = await api("/auth/register", {
          method: "POST",
          body: {
            name,
            email,
            password,
            role: "TENANT",
          },
        });

        navigate("/verify-email", {
          state: {
            email,
            message: result.message,
            bookingReturn,
          },
        });
        return;
      }

      const result = await api("/auth/verify-email", {
        method: "POST",
        body: { email, otp },
      });

      navigate("/login", {
        state: {
          email,
          message: result.message + " Sign in now.",
          bookingReturn,
        },
      });
    } catch (err) {
      setStatus(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-side">
        <div className="logo-light">G✦ GoyalNest</div>

        <div className="auth-pitch">
          <span className="eyebrow light">
            THE ART OF LIVING WELL
          </span>

          <h1>
            Spaces that feel
            <br />
            <em>like home.</em>
          </h1>

          <p>
            Find, manage and experience exceptional living
            spaces — all from one thoughtfully designed platform.
          </p>
        </div>

        <div className="auth-foot">
          PROPERTY RENTAL &amp; PG MANAGEMENT
        </div>
      </div>

      <div className="auth-panel">
        <div className="mobile-brand">G✦ GoyalNest</div>

        <div className="auth-card">
          <span className="eyebrow">
            WELCOME TO GOYALNEST
          </span>

          <h2>
            {isLogin
              ? "Sign in to your portal"
              : isRegister
                ? "Create your Tenant account"
                : "Verify your email"}
          </h2>

          <p className="muted">
            {isLogin
              ? "Access your secure workspace."
              : isRegister
                ? "Register as a Tenant to find your next home."
                : "Enter the six-digit verification code sent to your email."}
          </p>

          {!isVerify && (
            <div className="tabbar">
              <Link
                className={isLogin ? "active" : ""}
                to="/login"
                state={{ bookingReturn, email }}
              >
                Sign in
              </Link>

              <Link
                className={isRegister ? "active" : ""}
                to="/register"
                state={{ bookingReturn, email }}
              >
                Tenant Registration
              </Link>
            </div>
          )}

          <form onSubmit={submit} className="auth-form">
            {isLogin && (
              <label>
                Portal / Role
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                >
                  {roles.map(([value, label]) => (
                    <option value={value} key={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {isRegister && (
              <label>
                Full name
                <input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your full name"
                />
              </label>
            )}

            <label>
              Email address
              <input
                required
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </label>

            {isVerify ? (
              <label>
                Verification code
                <input
                  required
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  placeholder="6-digit code"
                />
              </label>
            ) : (
              <div className="auth-password-group">
                <label htmlFor="auth-password">
                  Password
                </label>

                <div className="password-field">
                  <input
                    id="auth-password"
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={isRegister ? 8 : undefined}
                    maxLength={isRegister ? 128 : undefined}
                    autoComplete={
                      isRegister
                        ? "new-password"
                        : "current-password"
                    }
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Your password"
                  />

                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={
                      showPassword
                        ? "Hide password"
                        : "Show password"
                    }
                    aria-pressed={showPassword}
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>

                {isRegister && (
                  <p role="status" style={{fontSize: "0.82rem", color: password.length > 0 && password.length < 8 ? "#ac4b23" : "#526d60", margin: "9px 0 0"}}>
                    Use 8–128 characters for a password. {password.length > 0 && password.length < 8 ? `${8 - password.length} more needed.` : password.length >= 8 ? "Length requirement met." : ""}
                  </p>
                )}
                {isLogin && (
                  <div className="forgot-password-row">
                    <Link to="/forgot-password">
                      Forgot Password?
                    </Link>
                  </div>
                )}
              </div>
            )}

            <button
              type="submit"
              className="btn primary wide"
              disabled={busy}
            >
              {busy
                ? "Please wait..."
                : isLogin
                  ? "Sign in securely"
                  : isRegister
                    ? "Create Tenant Account"
                    : "Verify Email"}
            </button>

            {(status || location.state?.message) && (
              <div className="notice">
                {status || location.state?.message}
              </div>
            )}
          </form>

          <Link
            to="/"
            className="btn outline wide"
            style={{
              marginTop: 14,
              display: "inline-block",
              textAlign: "center",
            }}
          >
            Back to Homepage
          </Link>

          <p className="auth-help">
            Property Owners are created by Super Admin.
            Property Managers are appointed by Owners.
            Public registration is available only for Tenants.
          </p>
        </div>
      </div>
    </main>
  );
}
