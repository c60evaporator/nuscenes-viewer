import { describe, it, expect } from 'vitest'
import {
  computeVideoLayout,
  VIDEO_CELL_W,
  VIDEO_CELL_H,
  VIDEO_CHANNEL_ORDER,
} from '@/lib/videoFrame'

describe('computeVideoLayout', () => {
  it('9チャンネル選択で 3x3 (1920x1080) になる', () => {
    const layout = computeVideoLayout([...VIDEO_CHANNEL_ORDER])
    expect(layout.cols).toBe(3)
    expect(layout.rows).toBe(3)
    expect(layout.width).toBe(3 * VIDEO_CELL_W)   // 1920
    expect(layout.height).toBe(3 * VIDEO_CELL_H)  // 1080
    expect(layout.cells).toHaveLength(9)
  })

  it('チャンネルは VIDEO_CHANNEL_ORDER 順に配置され EGO_POSE が左上に来る', () => {
    // 入力順をシャッフルしても配置順は固定
    const shuffled = ['CAM_BACK', 'EGO_POSE', 'RADAR_FRONT', 'LIDAR_TOP']
    const layout = computeVideoLayout(shuffled)
    expect(layout.cells.map((c) => c.channel)).toEqual([
      'EGO_POSE', 'LIDAR_TOP', 'RADAR_FRONT', 'CAM_BACK',
    ])
    expect(layout.cells[0]).toMatchObject({ x: 0, y: 0 })
  })

  it('CAM 6個選択で 3x2 になり前列→後列の順で並ぶ', () => {
    const cams = [
      'CAM_FRONT_LEFT', 'CAM_FRONT', 'CAM_FRONT_RIGHT',
      'CAM_BACK_LEFT', 'CAM_BACK', 'CAM_BACK_RIGHT',
    ]
    const layout = computeVideoLayout(cams)
    expect(layout.cols).toBe(3)
    expect(layout.rows).toBe(2)
    // 1行目が FRONT 系、2行目が BACK 系
    expect(layout.cells.slice(0, 3).map((c) => c.channel)).toEqual([
      'CAM_FRONT_LEFT', 'CAM_FRONT', 'CAM_FRONT_RIGHT',
    ])
    expect(layout.cells.slice(3).every((c) => c.y === VIDEO_CELL_H)).toBe(true)
  })

  it('1チャンネル選択でセル1個分のサイズになる', () => {
    const layout = computeVideoLayout(['CAM_FRONT'])
    expect(layout.width).toBe(VIDEO_CELL_W)
    expect(layout.height).toBe(VIDEO_CELL_H)
    expect(layout.cells).toHaveLength(1)
  })

  it('未知のチャンネルは既知チャンネルの後ろに追加される', () => {
    const layout = computeVideoLayout(['CAM_EXTRA_99', 'LIDAR_TOP'])
    expect(layout.cells.map((c) => c.channel)).toEqual(['LIDAR_TOP', 'CAM_EXTRA_99'])
  })

  it('セル同士が重ならない', () => {
    const layout = computeVideoLayout([...VIDEO_CHANNEL_ORDER])
    for (let i = 0; i < layout.cells.length; i++) {
      for (let j = i + 1; j < layout.cells.length; j++) {
        const a = layout.cells[i]
        const b = layout.cells[j]
        const overlap =
          a.x < b.x + b.w && b.x < a.x + a.w &&
          a.y < b.y + b.h && b.y < a.y + a.h
        expect(overlap).toBe(false)
      }
    }
  })

  it('空配列で空レイアウトを返す', () => {
    const layout = computeVideoLayout([])
    expect(layout.width).toBe(0)
    expect(layout.height).toBe(0)
    expect(layout.cells).toHaveLength(0)
  })
})
