/** Original dictionary keys. Kept separate so zh-TW can cover every one. */
export const baseKeys = [
  'appName', 'eventName', 'presenter', 'signIn', 'signUp', 'fan', 'performer', 'organizer',
  'follow', 'following', 'oshi', 'oshiOn', 'tip', 'search', 'live', 'notifications', 'profile',
  'vote', 'voted', 'nearby', 'liveNow', 'home', 'acts', 'timetable', 'map', 'account', 'ranking',
  'votes', 'overseas', 'eventHome', 'continue', 'processing', 'displayName', 'email', 'password',
  'firstTime', 'alreadyHaveAccount', 'backToEvent', 'authLead', 'performerNeedApproval',
  'organizerHint', 'start', 'seeEvent', 'setupNeeded', 'setupHint', 'welcomeTitle', 'welcomeLead',
  'welcomePublic', 'guest', 'checkEmail', 'signOut', 'needAuthActions', 'comingSoonRoster',
  'comingSoonSchedule', 'noLiveNow', 'nextEvent', 'timetableTitle', 'timetableLead', 'mapTitle',
  'mapLead', 'findActs', 'featuredActs', 'heroWatchLive', 'heroSeeNow', 'heroSeeActs', 'heroSoon',
  'openMap', 'venueMapSee', 'fromHere', 'venueNow', 'voteHint', 'votedHere', 'loginToContinue',
  'tipHeading', 'liveListLead', 'noVotesYet', 'geoHint', 'watch', 'support', 'actsTitle',
  'datesPending', 'osmOpen', 'liveScheduled', 'liveEnded', 'back', 'officialSite', 'signInToWatch',
  'commentPlaceholder', 'send', 'cancel', 'customAmount', 'payNow', 'tipSecure', 'liveEndedMsg',
  'comingSoonVenue', 'liveList', 'liveRanking', 'streamSlot', 'endedLives', 'noMatchActs',
  'profileReady', 'watchInApp', 'tipSuccess', 'tipCancelled', 'merchSuccess', 'merchCancelled',
  'goLive', 'openMapConfirm',
] as const

export type I18nKey = (typeof baseKeys)[number]
