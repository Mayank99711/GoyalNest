import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { prisma } from "../../config/prisma.js";
import { env } from "../../config/env.js";
import { asyncRoute, required, fail } from "../../lib/errors.js";
import { authenticate } from "../../middleware/auth.js";
import { sendOtpEmail } from "../../lib/email.js";
import { tenantPasswordError } from "./passwordPolicy.js";
import {
  normalizeEmail,
  securePassword,
  passwordMatches,
  generateOtp,
  fingerprintOtp,
} from "./auth.service.js";
const router = Router();
const publicUser = (u, staff = null) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
  designation: staff?.designation || null,
  staffPermissions: staff ? (Array.isArray(staff.permissions) ? staff.permissions : []) : null,
  verified: u.verified,
});
router.post(
  "/register",
  asyncRoute(async (req, res) => {
    const { name, email, password, role, phone } = req.body;
    required(
      role === "TENANT",
      "Only tenants may self-register. Property Owners are created by Super Admin",
    );
    required(String(name || "").trim().length >= 2, "Full name must contain at least 2 characters.");
    required(/^\S+@\S+\.\S+$/.test(email || ""), "Please enter a valid email address.");
    const passwordIssue = tenantPasswordError(password);
    required(!passwordIssue, passwordIssue || "Invalid password.");
    const lower = normalizeEmail(email);
    if (await prisma.user.findUnique({ where: { email: lower } }))
      fail(409, "Email already registered");
    const user = await prisma.user.create({
      data: {
        name,
        email: lower,
        passwordHash: await securePassword(password),
        role,
        phone: phone || null,
        verified: false,
      },
    });
    {
      const code = generateOtp();
      await prisma.otpCode.create({
        data: {
          userId: user.id,
          hash: fingerprintOtp(code),
          expiresAt: new Date(Date.now() + 600000),
        },
      });
      try {
        await sendOtpEmail(lower, code);
      } catch (e) {
        if (!env.devShowOtp) {
          await prisma.user.delete({ where: { id: user.id } });
          throw Object.assign(
            new Error("Email delivery failed. Verify SMTP configuration."),
            { status: 503 },
          );
        }
      }
      return res.status(201).json({
        message: "Check your email for OTP",
        ...(env.devShowOtp ? { developmentOtp: code } : {}),
      });
    }
  }),
);
router.post(
  "/verify-email",
  asyncRoute(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { email: String(req.body.email || "").toLowerCase() },
      include: { otp: true },
    });
    required(user && user.role === "TENANT" && user.otp, "OTP not found", 404);
    required(
      user.otp.expiresAt > new Date() && user.otp.attempts < 5,
      "OTP expired or locked",
    );
    await prisma.otpCode.update({
      where: { userId: user.id },
      data: { attempts: { increment: 1 } },
    });
    required(
      fingerprintOtp(req.body.otp || "") === user.otp.hash,
      "Incorrect OTP",
    );
    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { verified: true } }),
      prisma.otpCode.delete({ where: { userId: user.id } }),
    ]);
    res.json({ message: "Email verified" });
  }),
);

const RESET_OTP_EXPIRY_MS = 10 * 60 * 1000;
const RESET_OTP_COOLDOWN_MS = 60 * 1000;

router.post(
  "/forgot-password",
  asyncRoute(async (req, res) => {
    const email = normalizeEmail(String(req.body.email || "").trim());

    required(/^\S+@\S+\.\S+$/.test(email), "Valid email address required", 400);

    const message = "If an account exists, a password reset OTP has been sent.";

    const user = await prisma.user.findUnique({
      where: { email },
    });

    // Do not reveal whether an email is registered.
    if (!user || !user.active) {
      return res.json({ message });
    }

    const previous = await prisma.passwordResetOtp.findUnique({
      where: { email },
    });

    // One request per minute for this email.
    if (
      previous &&
      Date.now() - previous.createdAt.getTime() < RESET_OTP_COOLDOWN_MS
    ) {
      return res.json({ message });
    }

    const code = generateOtp();

    await prisma.passwordResetOtp.upsert({
      where: { email },
      create: {
        email,
        hash: fingerprintOtp(code),
        expiresAt: new Date(Date.now() + RESET_OTP_EXPIRY_MS),
      },
      update: {
        hash: fingerprintOtp(code),
        expiresAt: new Date(Date.now() + RESET_OTP_EXPIRY_MS),
        attempts: 0,
        createdAt: new Date(),
      },
    });

    try {
      await sendOtpEmail(email, code);
    } catch (error) {
      console.error("Password reset email delivery failed:", error.message);

      // No OTP is exposed if email delivery fails.
      return res.json({ message });
    }

    res.json({ message });
  }),
);

router.post(
  "/reset-password",
  asyncRoute(async (req, res) => {
    const email = normalizeEmail(String(req.body.email || "").trim());

    const otp = String(req.body.otp || "").trim();
    const newPassword = String(req.body.newPassword || "");

    required(/^\S+@\S+\.\S+$/.test(email), "Valid email required", 400);

    required(/^\d{6}$/.test(otp), "Enter a valid 6-digit OTP", 400);

    const passwordIssue = tenantPasswordError(newPassword);
    required(!passwordIssue, passwordIssue || "Invalid password.", 400);

    const reset = await prisma.passwordResetOtp.findUnique({
      where: { email },
    });

    required(
      reset && reset.expiresAt > new Date() && reset.attempts < 5,
      "OTP expired or invalid. Request a new OTP.",
      400,
    );

    // Count each attempt, including incorrect attempts.
    await prisma.passwordResetOtp.update({
      where: { email },
      data: {
        attempts: { increment: 1 },
      },
    });

    required(fingerprintOtp(otp) === reset.hash, "Incorrect OTP", 400);

    const user = await prisma.user.findUnique({
      where: { email },
    });

    required(user && user.active, "Password reset unavailable", 400);

    const passwordHash = await securePassword(newPassword);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { passwordHash },
      }),
      prisma.passwordResetOtp.delete({
        where: { email },
      }),
    ]);

    res.clearCookie("goyalnest_session");

    res.json({
      message: "Password reset successful. Please sign in.",
    });
  }),
);

router.post(
  "/login",
  asyncRoute(async (req, res) => {
    const { email, password, portalRole } = req.body;
    required(
      ["ADMIN", "OWNER", "MANAGER", "TENANT"].includes(portalRole),
      "Select the correct portal",
    );
    const u = await prisma.user.findUnique({
      where: { email: String(email || "").toLowerCase() },
    });
    if (!u || !(await passwordMatches(password || "", u.passwordHash)))
      fail(401, "Invalid email or password");
    required(
      u.role === portalRole,
      "This account cannot access selected portal",
      403,
    );
    required(u.verified && u.active, "Account not verified or disabled", 403);
    // One browser cookie per portal; never silently replace another authenticated role.
    const current = req.cookies.goyalnest_session;
    if (current) {
      try {
        const old = jwt.verify(current, env.jwtSecret);
        if (old.id !== u.id)
          fail(409, "Another portal is signed in. Log out first.");
      } catch (err) {
        if (err.status) throw err;
      }
    }
    if (u.role === "MANAGER") {
      const employee = await prisma.ownerEmployee.findFirst({ where: { managerUserId: u.id }, select: { active: true } });
      if (employee && !employee.active) fail(403, "Employee account disabled");
    }
    const token = jwt.sign({ id: u.id, role: u.role }, env.jwtSecret, {
      expiresIn: "7d",
    });
    res.cookie("goyalnest_session", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 7 * 86400000,
    });
    const staff = u.role === "MANAGER" ? await prisma.ownerEmployee.findFirst({where:{managerUserId:u.id,active:true},select:{designation:true,permissions:true}}) : null;
    res.json({ user: publicUser(u, staff) });
  }),
);
router.post("/logout", (req, res) => {
  res.clearCookie("goyalnest_session");
  res.json({ message: "Signed out" });
});
router.get("/me", authenticate, asyncRoute(async (req, res) => {
  const staff = req.user.role === "MANAGER" ? await prisma.ownerEmployee.findFirst({where:{managerUserId:req.user.id,active:true},select:{designation:true,permissions:true}}) : null;
  res.json({ user: publicUser(req.user, staff) });
}));
export default router;
