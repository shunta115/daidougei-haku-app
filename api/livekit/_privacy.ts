export function canAccessPrivateTestLive(
  userId: string | null,
  performerId: string,
  isAdmin: boolean,
  isSessionAllowlisted: boolean,
) {
  return Boolean(userId && (userId === performerId || isAdmin || isSessionAllowlisted))
}

export const VERIFIED_TEST_PERFORMER_ID = '29bd1d83-f8a1-47a3-acd7-c9a4f27bffe1'
export const VERIFIED_PRIVATE_VIEWER_ID = '1c21f421-5561-4213-8759-962873accfa0'

export function canAccessPrivateTestMap(userId: string | null, performerId: string, isAdmin = false) {
  return Boolean(userId && (
    userId === performerId
    || isAdmin
    || (performerId === VERIFIED_TEST_PERFORMER_ID && userId === VERIFIED_PRIVATE_VIEWER_ID)
  ))
}
