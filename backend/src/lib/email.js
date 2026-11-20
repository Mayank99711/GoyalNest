import nodemailer from "nodemailer";
import { env } from "../config/env.js";
export async function sendOtpEmail(to, code) {
  const s = env.smtp;
  if (!s.host || !s.user || !s.pass || !s.from)
    throw Error(
      "SMTP not configured: set SMTP_HOST, SMTP_USER, SMTP_PASSWORD, MAIL_FROM",
    );
  const transporter = nodemailer.createTransport({
    host: s.host,
    port: s.port,
    secure: s.secure,
    auth: { user: s.user, pass: s.pass },
  });
  await transporter.sendMail({
    from: s.from,
    to,
    subject: "GoyalNest - Verify your email",
    text: `Your GoyalNest verification code is ${code}. It expires in 10 minutes. Do not share this code.`,
  });
}

export async function sendRentReminder(to, period, amount, dueDate) {
  const s = env.smtp;

  if (!s.host || !s.user || !s.pass || !s.from) {
    throw new Error("SMTP is not configured for reminders");
  }

  const transporter = nodemailer.createTransport({
    host: s.host,
    port: s.port,
    secure: s.secure,
    auth: {
      user: s.user,
      pass: s.pass,
    },
  });

  const message = `
Dear Tenant,

This is a reminder regarding your GoyalNest
rental payment for ${period}.

Rent Amount: INR ${amount}
Payment Window: 1st–6th of the billing month
Payment Deadline: ${dueDate}

Please complete your payment through the
available payment process and check your
GoyalNest Tenant Portal for invoice details.

Important:
- Payments are accepted without late fees
  through the 6th.
- A one-time late fee may apply from the 7th
  if payment remains outstanding.
- If you have already paid, please disregard
  this reminder.

Regards,
GoyalNest Property & Living
`;

  await transporter.sendMail({
    from: s.from,
    to,
    subject: `GoyalNest | Rent Reminder - ${period}`,
    text: message,
  });
}
