import { prisma } from "../../config/prisma.js";
import { asyncRoute, required } from "../../lib/errors.js";

// Restrict cancellation to bookings that have never started occupancy or move-out.
// This middleware deliberately rejects direct API calls, not only hidden UI buttons.
export const bookingCancellationGuard = asyncRoute(async (req, res, next) => {
  const booking = await prisma.booking.findUnique({
    where: { id: req.params.id },
    select: {
      id: true,
      tenantId: true,
      status: true,
      tenancy: {
        select: {
          status: true,
          checkInAt: true,
          checkOutAt: true,
          moveOut: { select: { id: true } },
        },
      },
    },
  });
  required(booking && booking.tenantId === req.user.id, "Booking unavailable", 404);
  required(["PENDING", "APPROVED"].includes(booking.status), "Cancellation not allowed", 409);
  const tenancy = booking.tenancy;
  required(
    !tenancy || (
      tenancy.status === "PENDING_PAYMENT" &&
      !tenancy.checkInAt &&
      !tenancy.checkOutAt &&
      !tenancy.moveOut
    ),
    "Cannot cancel after check-in or once move-out/checkout has started. View stay history instead.",
    409,
  );
  next();
});
