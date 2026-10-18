export function canAccessPrivateTestLive(
  userId: string | null,
  performerId: string,
  isAdmin: boolean,
  isSessionAllowlisted: boolean,
) {
  return Boolean(userId && (userId === performerId || isAdmin || isSessionAllowlisted))
}
