import { describe, it, expect, vi, afterEach } from 'vitest'
import { pickSupportedWebmMimeType } from '@/lib/videoEncoder'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('pickSupportedWebmMimeType', () => {
  it('MediaRecorder が存在しない環境（node）では null を返す', () => {
    expect(typeof MediaRecorder).toBe('undefined')
    expect(pickSupportedWebmMimeType()).toBeNull()
  })

  it('vp9 対応なら vp9 を返す', () => {
    vi.stubGlobal('MediaRecorder', {
      isTypeSupported: (t: string) => t === 'video/webm;codecs=vp9',
    })
    expect(pickSupportedWebmMimeType()).toBe('video/webm;codecs=vp9')
  })

  it('vp9 非対応・vp8 対応なら vp8 にフォールバックする', () => {
    vi.stubGlobal('MediaRecorder', {
      isTypeSupported: (t: string) => t === 'video/webm;codecs=vp8',
    })
    expect(pickSupportedWebmMimeType()).toBe('video/webm;codecs=vp8')
  })

  it('コーデック指定なしの webm のみ対応ならそれを返す', () => {
    vi.stubGlobal('MediaRecorder', {
      isTypeSupported: (t: string) => t === 'video/webm',
    })
    expect(pickSupportedWebmMimeType()).toBe('video/webm')
  })

  it('全 mimeType 非対応なら null を返す', () => {
    vi.stubGlobal('MediaRecorder', {
      isTypeSupported: () => false,
    })
    expect(pickSupportedWebmMimeType()).toBeNull()
  })
})
