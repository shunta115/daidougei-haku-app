// Verify existing credentials inside the build environment; never print keys.
if (process.env.VITE_SMART_PUSH_TEST_LIFECYCLE === 'true') {
  const expected = 'https://aeqskxxykzapgaudbeqa.supabase.co'
  if (process.env.VERCEL_ENV !== 'preview' || process.env.VITE_SUPABASE_URL !== expected || process.env.SUPABASE_URL !== expected) throw new Error('SMART PUSH TEST boundary mismatch')
  if ((process.env.ENABLE_LIVE_START_WEB_PUSH === 'true' || process.env.ENABLE_APPEARANCE_WEB_PUSH === 'true') && process.env.SMART_PUSH_DEVICE_TEST_APPROVED !== 'true') throw new Error('Real TEST sending requires separate device approval')
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anon = process.env.VITE_SUPABASE_ANON_KEY
  if (!service || !anon) throw new Error('TEST credentials unavailable')
  if (!process.env.WEB_PUSH_VAPID_PRIVATE_KEY || !process.env.WEB_PUSH_VAPID_PUBLIC_KEY || process.env.WEB_PUSH_VAPID_PUBLIC_KEY !== process.env.VITE_WEB_PUSH_PUBLIC_KEY) throw new Error('Isolated TEST VAPID configuration mismatch')
  const control = await fetch(expected+'/rest/v1/smart_push_control?id=eq.1&select=enabled', {
    headers:{apikey:service,Authorization:`Bearer ${service}`},signal:AbortSignal.timeout(10000),
  })
  if (!control.ok) throw new Error(`TEST service probe failed: HTTP ${control.status}`)
  const data=await control.json()
  if (data.length!==1 || data[0].enabled!==false) throw new Error('Build requires the TEST sender to remain paused')
  const auth = await fetch(expected+'/auth/v1/settings',{headers:{apikey:anon},signal:AbortSignal.timeout(10000)})
  if (!auth.ok) throw new Error(`TEST public Auth probe failed: HTTP ${auth.status}`)
  console.log('SMART_PUSH_TEST_BOUNDARY_OK: TEST client/Auth/service API verified; sender remains paused; keys not logged')
}
