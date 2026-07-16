/**
 * 動画エンコーダ抽象化
 *
 * 現在は MediaRecorder + canvas.captureStream 実装のみ。
 * フレーム精度が必要になった場合は、同じ FrameEncoder インターフェースで
 * WebCodecs (VideoEncoder + muxer) 実装に差し替える（frameDrawn() を即時解決にするだけ）。
 */

export interface FrameEncoder {
  /** 録画を開始する。canvas はレイアウトサイズに設定済みであること */
  start(canvas: HTMLCanvasElement, fps: number): void
  /** フレームを 1 枚描画し終えた後に呼ぶ。次フレームを描画可能になるまで待機する */
  frameDrawn(): Promise<void>
  /** 録画を終了し、動画 Blob を返す */
  stop(): Promise<Blob>
  /** 録画を破棄する（Blob は生成されない） */
  abort(): void
  readonly mimeType: string
}

/**
 * ブラウザがサポートする WebM の mimeType を vp9 → vp8 → 無指定 の順で返す。
 * MediaRecorder 非対応環境（テスト環境含む）では null。
 */
export function pickSupportedWebmMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null
  const candidates = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ]
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c)) return c
  }
  return null
}

export function createMediaRecorderEncoder(): FrameEncoder {
  let recorder: MediaRecorder | null = null
  let track:    CanvasCaptureMediaStreamTrack | null = null
  let chunks:   Blob[] = []
  let fps       = 2
  let mimeType  = ''

  return {
    get mimeType() {
      return mimeType
    },

    start(canvas: HTMLCanvasElement, fpsArg: number) {
      const mt = pickSupportedWebmMimeType()
      if (!mt) throw new Error('WebM recording is not supported in this browser')
      mimeType = mt
      fps      = fpsArg
      // fps=0 の captureStream + requestFrame() で明示的にフレームをキャプチャする
      // （自動キャプチャによるフレーム落ち・重複を防ぐ）
      const stream = canvas.captureStream(0)
      track    = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack
      recorder = new MediaRecorder(stream, {
        mimeType: mt,
        videoBitsPerSecond: 8_000_000,
      })
      chunks = []
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data)
      }
      recorder.start()
    },

    async frameDrawn() {
      track?.requestFrame()
      // MediaRecorder は実時間録画のため 1/fps 秒待つ。
      // rAF はバックグラウンドタブで停止するため setTimeout を使う
      await new Promise((resolve) => setTimeout(resolve, 1000 / fps))
    },

    stop(): Promise<Blob> {
      return new Promise((resolve, reject) => {
        if (!recorder) {
          reject(new Error('Encoder is not started'))
          return
        }
        const rec = recorder
        rec.onstop = () => {
          track?.stop()
          recorder = null
          track    = null
          resolve(new Blob(chunks, { type: mimeType }))
        }
        rec.stop()
      })
    },

    abort() {
      if (recorder && recorder.state !== 'inactive') {
        recorder.onstop = null
        try { recorder.stop() } catch { /* already stopped */ }
      }
      track?.stop()
      recorder = null
      track    = null
      chunks   = []
    },
  }
}
