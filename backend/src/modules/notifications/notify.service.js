// Durable, role-targeted user-specific inbox messages.
// Notifications are informational; authorization is always enforced by the destination API.
export async function activeUserIdsByRole(tx, role) {
  const users = await tx.user.findMany({ where: { role, active: true }, select: { id: true } });
  return users.map(user => user.id);
}
export async function activeManagerIdsForProperty(tx, propertyId) {
  const assignments = await tx.managerAssignment.findMany({
    where: { propertyId, manager: { active: true, role: 'MANAGER' } },
    select: { managerId: true },
  });
  return assignments.map(item => item.managerId);
}
// Durable user-specific inbox messages. The caller can pass the Prisma transaction client.
export async function notifyUsers(tx, { userIds, title, message, type, referenceId }) {
  const recipients = [...new Set(userIds.filter(Boolean))];
  if (!recipients.length) return;
  await tx.userNotification.createMany({
    data: recipients.map(userId => ({ userId, title, message, type, referenceId })),
  });
}

export async function disputeRecipients(tx, dispute) {
  const ids = new Set([dispute.openedById]);
  let bookingId = dispute.bookingId;
  if (!bookingId && dispute.paymentId) {
    const payment = await tx.payment.findUnique({
      where: { id: dispute.paymentId }, select: { tenancy: { select: { bookingId: true } } },
    });
    bookingId = payment?.tenancy?.bookingId;
  }
  if (bookingId) {
    const booking = await tx.booking.findUnique({
      where: { id: bookingId },
      select: { tenantId: true, unit: { select: { property: { select: { ownerId: true } } } } },
    });
    if (booking) {
      ids.add(booking.tenantId);
      ids.add(booking.unit.property.ownerId);
    }
  }
  const admins = await tx.user.findMany({ where: { role: 'ADMIN', active: true }, select: { id: true } });
  admins.forEach(a => ids.add(a.id));
  return [...ids].filter(Boolean);
}
