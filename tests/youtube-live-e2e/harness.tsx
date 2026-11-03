import React from 'react'
import { createRoot } from 'react-dom/client'
import { YouTubeLiveSetup } from '../../src/platform/components/YouTubeLiveSetup'
import type { Performer } from '../../src/platform/lib/types'
import '../../src/platform/platform.css'
import '../../src/platform/screens/youtube-live.css'
const performer = { id: 'owner', youtube_live_video_id: null, youtube_live_url: null, youtube_live_enabled: false } as Performer
createRoot(document.getElementById('root')!).render(<YouTubeLiveSetup performer={performer} onBack={() => {}} onChooseDirect={() => {}} onPreview={() => {}} onSaved={async () => {}} />)
