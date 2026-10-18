export function previewReadiness(stripeMode: 'test' | 'live' | 'unknown') {
  const value = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
  let supabaseProjectRef = 'unknown'
  try {
    const url = new URL(value)
    if (url.protocol === 'https:' && url.hostname.endsWith('.supabase.co')) {
      supabaseProjectRef = url.hostname.slice(0, -'.supabase.co'.length) || 'unknown'
    }
  } catch {
    /* Fail closed without returning the configured URL. */
  }
  return {
    environment: 'preview' as const,
    stripeMode,
    supabaseProjectRef,
    safeForStripeOnboardingTest: stripeMode === 'test' && supabaseProjectRef !== 'unknown',
  }
}
