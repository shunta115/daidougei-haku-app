import type { VercelRequest, VercelResponse } from '@vercel/node'
import { activeYouTubeChat, getDestination, requirePerformer, youtubeApi } from './_shared.js'

type YouTubeMessage = {
  id: string
  snippet?: {
    type?: string
    displayMessage?: string
    publishedAt?: string
    superChatDetails?: { amountMicros?: string; currency?: string; amountDisplayString?: string; userComment?: string }
    superStickerDetails?: { amountMicros?: string; currency?: string; amountDisplayString?: string }
  }
  authorDetails?: { displayName?: string; profileImageUrl?: string }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const user = await requirePerformer(req, res)
  if (!user) return
  try {
    const row = await getDestination(user.id)
    if (!row?.encrypted_oauth) {
      res.status(409).json({ error: 'YouTube OAuth連携が必要です。' })
      return
    }
    const { liveChatId } = await activeYouTubeChat(row)
    if (req.method === 'GET') {
      const pageToken = typeof req.query.pageToken === 'string' ? req.query.pageToken : ''
      const params = new URLSearchParams({ liveChatId, part: 'id,snippet,authorDetails', maxResults: '200', hl: 'ja' })
      if (pageToken) params.set('pageToken', pageToken)
      const data = await youtubeApi<{ items?: YouTubeMessage[]; nextPageToken?: string; pollingIntervalMillis?: number }>(row, `liveChat/messages?${params}`)
      res.status(200).json({
        source: 'youtube',
        nextPageToken: data.nextPageToken,
        pollingIntervalMillis: Math.max(2000, data.pollingIntervalMillis || 5000),
        items: (data.items || []).map((item) => ({
          id: item.id,
          source: 'youtube',
          type: item.snippet?.type || 'unknown',
          displayName: item.authorDetails?.displayName || 'YouTube',
          message: item.snippet?.displayMessage || item.snippet?.superChatDetails?.userComment || '',
          publishedAt: item.snippet?.publishedAt,
          externalRevenue: item.snippet?.superChatDetails ? {
            kind: 'super_chat',
            amountMicros: item.snippet.superChatDetails.amountMicros,
            currency: item.snippet.superChatDetails.currency,
            displayAmount: item.snippet.superChatDetails.amountDisplayString,
          } : item.snippet?.superStickerDetails ? {
            kind: 'super_sticker',
            amountMicros: item.snippet.superStickerDetails.amountMicros,
            currency: item.snippet.superStickerDetails.currency,
            displayAmount: item.snippet.superStickerDetails.amountDisplayString,
          } : undefined,
        })),
      })
      return
    }
    if (req.method === 'POST') {
      const message = typeof req.body?.message === 'string' ? req.body.message.trim() : ''
      if (!message || message.length > 200) {
        res.status(400).json({ error: '返信は1〜200文字で入力してください。' })
        return
      }
      await youtubeApi(row, 'liveChat/messages?part=snippet', {
        method: 'POST',
        body: JSON.stringify({ snippet: { liveChatId, type: 'textMessageEvent', textMessageDetails: { messageText: message } } }),
      })
      res.status(201).json({ ok: true })
      return
    }
    res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    console.error('youtube chat failed', { name: error instanceof Error ? error.name : 'unknown' })
    res.status(502).json({ error: 'YouTube LIVEチャットに接続できませんでした。' })
  }
}
