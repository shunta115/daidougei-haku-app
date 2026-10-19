import { EgressInfo, EgressStatus, StreamInfo, StreamInfo_Status } from '@livekit/protocol'
import { describe, expect, it } from 'vitest'
import { runtimeStateFromEgress } from '../api/multi-live/_shared'

describe('Multi LIVE Egress reconciliation', () => {
  it('reports active LiveKit Egress as independently live', () => {
    const state = runtimeStateFromEgress(new EgressInfo({ egressId: 'EG_active', status: EgressStatus.EGRESS_ACTIVE }))
    expect(state).toEqual({ status: 'live', egress_id: 'EG_active', last_error_code: null })
  })

  it('keeps a failed YouTube stream Egress id so cleanup can still stop it', () => {
    const state = runtimeStateFromEgress(new EgressInfo({
      egressId: 'EG_failed_stream',
      status: EgressStatus.EGRESS_ACTIVE,
      streamResults: [new StreamInfo({ status: StreamInfo_Status.FAILED, error: 'provider rejected stream' })],
    }))
    expect(state).toEqual({ status: 'failed', egress_id: 'EG_failed_stream', last_error_code: 'youtube_stream_failed' })
    expect(JSON.stringify(state)).not.toContain('provider rejected stream')
  })

  it('clears completed Egress and maps quota failures without provider details', () => {
    expect(runtimeStateFromEgress(new EgressInfo({ egressId: 'EG_done', status: EgressStatus.EGRESS_COMPLETE }))).toEqual({ status: 'stopped', egress_id: null, last_error_code: null })
    expect(runtimeStateFromEgress(new EgressInfo({ egressId: 'EG_quota', status: EgressStatus.EGRESS_LIMIT_REACHED, error: 'private detail' }))).toEqual({ status: 'failed', egress_id: null, last_error_code: 'egress_quota' })
  })
})
