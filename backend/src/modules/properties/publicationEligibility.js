// Checks eligibility for an admin publication of a PENDING listing.
// The current property already occupies a pending slot, so exclude it from the count.
export async function subscriptionPublicationEligibility(tx, property, now = new Date()) {
  const subscription = await tx.subscription.findFirst({
    where: { ownerId: property.ownerId, expiresAt: { gt: now } },
    orderBy: [{ expiresAt: "desc" }, { createdAt: "desc" }],
  });
  if (!subscription) return { ok: false, message: "Owner requires an active subscription before publication" };
  const otherListings = await tx.property.count({
    where: { ownerId: property.ownerId, id: { not: property.id }, status: { in: ["PENDING", "PUBLISHED"] } },
  });
  if (otherListings >= subscription.listingLimit) {
    return { ok: false, message: "Subscription listing limit reached" };
  }
  return { ok: true, subscription };
}
