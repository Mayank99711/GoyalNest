
import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../lib/api";

export default function ForgotPassword() {
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] =
    useState("");
  const [showPassword, setShowPassword] =
    useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function requestOtp(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");

    try {
      const result = await api("/auth/forgot-password", {
        method: "POST",
        body: { email },
      });

      setMessage(result.message);
      setStep(2);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword(e) {
    e.preventDefault();
    setError("");

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (newPassword.length < 8 || newPassword.length > 128) {
      setError("Password must be between 8 and 128 characters.");
      return;
    }

    setBusy(true);

    try {
      const result = await api("/auth/reset-password", {
        method: "POST",
        body: {
          email,
          otp,
          newPassword,
        },
      });

      navigate("/login", {
        replace: true,
        state: {
          email,
          message: result.message,
        },
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-side">
        <div className="logo-light">
          G✦ GoyalNest
        </div>

        <div className="auth-pitch">
          <span className="eyebrow light">
            ACCOUNT RECOVERY
          </span>

          <h1>
            Welcome back
            <br />
            <em>to your home.</em>
          </h1>

          <p>
            Securely recover access to your
            GoyalNest account.
          </p>
        </div>

        <div className="auth-foot">
          PROPERTY RENTAL &amp; PG MANAGEMENT
        </div>
      </div>

      <div className="auth-panel">
        <div className="mobile-brand">
          G✦ GoyalNest
        </div>

        <div className="auth-card">
          <span className="eyebrow">
            SECURE ACCOUNT RECOVERY
          </span>

          <h2>
            {step === 1
              ? "Forgot your password?"
              : "Reset your password"}
          </h2>

          <p className="muted">
            {step === 1
              ? "Enter your registered email address to receive a verification code."
              : "Enter the six-digit OTP and choose a new password."}
          </p>

          {step === 1 ? (
            <form
              onSubmit={requestOtp}
              className="auth-form"
            >
              <label>
                Registered email address
                <input
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) =>
                    setEmail(e.target.value)
                  }
                />
              </label>

              <button
                type="submit"
                className="btn primary wide"
                disabled={busy}
              >
                {busy
                  ? "Sending..."
                  : "Send Verification Code"}
              </button>
            </form>
          ) : (
            <form
              onSubmit={resetPassword}
              className="auth-form"
            >
              <label>
                Email address
                <input
                  value={email}
                  readOnly
                />
              </label>

              <label>
                Verification code
                <input
                  required
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  placeholder="6-digit OTP"
                  value={otp}
                  onChange={(e) =>
                    setOtp(
                      e.target.value.replace(/\D/g, "")
                    )
                  }
                />
              </label>

              <div className="auth-password-group">
                <label htmlFor="reset-password">
                  New password
                </label>

                <div className="password-field">
                  <input
                    id="reset-password"
                    type={
                      showPassword
                        ? "text"
                        : "password"
                    }
                    required
                    minLength={8}
                    maxLength={128}
                    autoComplete="new-password"
                    placeholder="New password"
                    value={newPassword}
                    onChange={(e) =>
                      setNewPassword(e.target.value)
                    }
                  />

                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() =>
                      setShowPassword((prev) => !prev)
                    }
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
              </div>

              <label>
                Confirm new password
                <input
                  type={
                    showPassword
                      ? "text"
                      : "password"
                  }
                  required
                  minLength={8}
                  maxLength={128}
                  autoComplete="new-password"
                  placeholder="Confirm new password"
                  value={confirmPassword}
                  onChange={(e) =>
                    setConfirmPassword(e.target.value)
                  }
                />
              </label>

              <button
                type="submit"
                className="btn primary wide"
                disabled={busy}
              >
                {busy
                  ? "Resetting..."
                  : "Reset Password"}
              </button>

              <button
                type="button"
                className="btn outline wide"
                onClick={() => {
                  setStep(1);
                  setOtp("");
                  setError("");
                  setMessage("");
                }}
              >
                Request New OTP
              </button>
            </form>
          )}

          {message && (
            <div className="notice">
              {message}
            </div>
          )}

          {error && (
            <div
              className="notice"
              role="alert"
              style={{ color: "#a52a2a" }}
            >
              {error}
            </div>
          )}

          <Link
            to="/login"
            className="btn outline wide"
            style={{
              marginTop: 16,
              display: "inline-block",
              textAlign: "center",
            }}
          >
            Back to Sign In
          </Link>
        </div>
      </div>
    </main>
  );
}
