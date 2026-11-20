import { prisma } from '../../config/prisma.js';
import { required } from '../../lib/errors.js';

// Call inside a serializable transaction when submitting a listing.
export async function checkListingSubscription(ownerId, tx = prisma) {
  const subscription = await tx.subscription.findFirst({
    where: { ownerId, expiresAt: { gt: new Date() } },
    orderBy: [{ expiresAt: 'desc' }, { createdAt: 'desc' }],
  });
  required(subscription, 'Active subscription required', 403);
  const occupiedSlots = await tx.property.count({
    where: { ownerId, status: { in: ['PENDING', 'PUBLISHED'] } },
  });
  required(occupiedSlots < subscription.listingLimit, 'Subscription property limit reached', 403);
  return subscription;
}
