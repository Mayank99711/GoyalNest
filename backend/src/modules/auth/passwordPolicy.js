export const MIN_TENANT_PASSWORD_LENGTH = 8;
export const MAX_TENANT_PASSWORD_LENGTH = 128;
export function tenantPasswordError(password) {
  if (typeof password !== "string" || password.length < MIN_TENANT_PASSWORD_LENGTH)
    return `Password must contain at least ${MIN_TENANT_PASSWORD_LENGTH} characters.`;
  if (password.length > MAX_TENANT_PASSWORD_LENGTH)
    return `Password must not exceed ${MAX_TENANT_PASSWORD_LENGTH} characters.`;
  return null;
}
