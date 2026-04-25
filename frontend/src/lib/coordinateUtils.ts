/**
 * 座標変換ユーティリティ
 * nuScenes グローバル座標系（ENU）を基準とする
 * quaternion: [w, x, y, z] 形式
 */

// ── 内部ヘルパー ──────────────────────────────────────────────────────────────

/** クォータニオン [w, x, y, z] → 3×3 回転行列 */
function quatToRotMat(q: number[]): number[][] {
  const [w, x, y, z] = q
  return [
    [1 - 2*(y*y + z*z),  2*(x*y - z*w),    2*(x*z + y*w)],
    [2*(x*y + z*w),      1 - 2*(x*x + z*z), 2*(y*z - x*w)],
    [2*(x*z - y*w),      2*(y*z + x*w),    1 - 2*(x*x + y*y)],
  ]
}

/** 3×3 行列とベクトルの積 */
function matVecMul(m: number[][], v: number[]): number[] {
  return [
    m[0][0]*v[0] + m[0][1]*v[1] + m[0][2]*v[2],
    m[1][0]*v[0] + m[1][1]*v[1] + m[1][2]*v[2],
    m[2][0]*v[0] + m[2][1]*v[1] + m[2][2]*v[2],
  ]
}

/** ベクトルの差 */
function vecSub(a: number[], b: number[]): number[] {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

/** ローカル3D座標 → カメラ座標系（透視投影前） */
function localToCamera(
  localPoint:  number[],
  egoPose:     { translation: number[]; rotation: number[] },
  calibSensor: { translation: number[]; rotation: number[] },
): number[] {
  const R_ego = quatToRotMat(egoPose.rotation)
  const R_egoT: number[][] = [
    [R_ego[0][0], R_ego[1][0], R_ego[2][0]],
    [R_ego[0][1], R_ego[1][1], R_ego[2][1]],
    [R_ego[0][2], R_ego[1][2], R_ego[2][2]],
  ]
  const p_ego = matVecMul(R_egoT, vecSub(localPoint, egoPose.translation))
  const R_cs = quatToRotMat(calibSensor.rotation)
  const R_csT: number[][] = [
    [R_cs[0][0], R_cs[1][0], R_cs[2][0]],
    [R_cs[0][1], R_cs[1][1], R_cs[2][1]],
    [R_cs[0][2], R_cs[1][2], R_cs[2][2]],
  ]
  return matVecMul(R_csT, vecSub(p_ego, calibSensor.translation))
}

/**
 * Sutherland-Hodgman アルゴリズムによるポリゴンのニアプレーンクリッピング（z >= near）
 *
 * 辺がニアプレーンを横切る交点を正確に計算するため、頂点スキップよりも正確な形状を保持する。
 */
function clipPolygonNear(camPts: number[][], near: number): number[][] {
  if (camPts.length === 0) return []
  const out: number[][] = []
  let prev = camPts[camPts.length - 1]
  for (const curr of camPts) {
    const prevIn = prev[2] >= near
    const currIn = curr[2] >= near
    if (currIn) {
      if (!prevIn) {
        const t = (near - prev[2]) / (curr[2] - prev[2])
        out.push([prev[0] + t * (curr[0] - prev[0]), prev[1] + t * (curr[1] - prev[1]), near])
      }
      out.push(curr)
    } else if (prevIn) {
      const t = (near - prev[2]) / (curr[2] - prev[2])
      out.push([prev[0] + t * (curr[0] - prev[0]), prev[1] + t * (curr[1] - prev[1]), near])
    }
    prev = curr
  }
  return out
}

/**
 * ポリライン（開いた線）をニアプレーン（z >= near）でクリッピングする（開いた列なので最初と最後を結ばない）
 * ポリゴン用の clipPolygonNear と異なり、後方→前方の再進入も正しく扱う。
 */
function clipPolylineNear(camPts: number[][], near: number): number[][] {
  if (camPts.length === 0) return []
  const out: number[][] = []
  const intersect = (a: number[], b: number[]) => {
    const t = (near - a[2]) / (b[2] - a[2])
    return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]), near]
  }
  let prev = camPts[0]
  if (prev[2] >= near) out.push(prev)
  for (let i = 1; i < camPts.length; i++) {
    const curr = camPts[i]
    const prevIn = prev[2] >= near
    const currIn = curr[2] >= near
    if (prevIn && currIn) {
      out.push(curr)
    } else if (prevIn && !currIn) {
      out.push(intersect(prev, curr))
    } else if (!prevIn && currIn) {
      out.push(intersect(prev, curr))
      out.push(curr)
    }
    prev = curr
  }
  return out
}

const NEAR_PLANE = 0.1  // カメラニアプレーン（メートル）

// ── 公開 API ─────────────────────────────────────────────────────────────────

export const NUSCENES_MAP_META: Record<string, {
  canvasEdge: [number, number]
  resolution: number             // m/px（固定 0.1）
}> = {
  'boston-seaport':           { canvasEdge: [2979.5, 2118.1], resolution: 0.1 },
  'singapore-onenorth':       { canvasEdge: [1585.6, 2025.0], resolution: 0.1 },
  'singapore-hollandvillage': { canvasEdge: [2808.3, 2922.9], resolution: 0.1 },
  'singapore-queenstown':     { canvasEdge: [3228.6, 3687.1], resolution: 0.1 },
}

/**
 * グローバル3D座標をカメラの2Dピクセル座標に投影する（ピンホールカメラモデル）
 *
 * @param point          グローバル座標 [x, y, z]
 * @param intrinsic      カメラ内部パラメータ 3×3 行列
 * @param egoPose        自車位置 { translation: [x,y,z], rotation: [w,x,y,z] }
 * @param calibSensor    キャリブレーション済みセンサー { translation: [x,y,z], rotation: [w,x,y,z] }
 * @returns              ピクセル座標 [u, v]、カメラ前方でない場合は null
 */
export function project3DTo2D(
  point:       number[],
  intrinsic:   number[][],
  egoPose:     { translation: number[]; rotation: number[] },
  calibSensor: { translation: number[]; rotation: number[] },
): [number, number] | null {
  // グローバル → エゴ座標系
  const R_ego = quatToRotMat(egoPose.rotation)
  // 転置 = 逆回転
  const R_ego_T: number[][] = [
    [R_ego[0][0], R_ego[1][0], R_ego[2][0]],
    [R_ego[0][1], R_ego[1][1], R_ego[2][1]],
    [R_ego[0][2], R_ego[1][2], R_ego[2][2]],
  ]
  const p_ego = matVecMul(R_ego_T, vecSub(point, egoPose.translation))

  // エゴ → カメラ座標系
  const R_cs = quatToRotMat(calibSensor.rotation)
  const R_cs_T: number[][] = [
    [R_cs[0][0], R_cs[1][0], R_cs[2][0]],
    [R_cs[0][1], R_cs[1][1], R_cs[2][1]],
    [R_cs[0][2], R_cs[1][2], R_cs[2][2]],
  ]
  const p_cam = matVecMul(R_cs_T, vecSub(p_ego, calibSensor.translation))

  // カメラ前方（z > 0）でない場合は投影不可
  if (p_cam[2] <= 0) return null

  // 内部パラメータ適用: [fx*x/z + cx, fy*y/z + cy]
  const u = intrinsic[0][0] * (p_cam[0] / p_cam[2]) + intrinsic[0][2]
  const v = intrinsic[1][1] * (p_cam[1] / p_cam[2]) + intrinsic[1][2]

  return [u, v]
}

/**
 * グローバル座標（ENU）をマップ表示画像のピクセル座標に変換する
 *
 * @param translation  自車グローバル座標 [x, y, z]（z は無視）
 * @param location     マップロケーション名（'singapore-onenorth' 等）
 * @param displaySize  表示画像サイズ [width_px, height_px]
 * @returns            表示画像上のピクセル座標 [px, py]
 *
 * SDK の BitMap.render が extent=[0, canvasW, 0, canvasH] で画像全体を
 * メートル空間に引き伸ばして表示するため、元画像ピクセルサイズは不要。
 * NuScenes のマップ座標系は左下原点（ENU）のため Y 軸を反転する。
 */
export function egoPoseToPixel(
  translation: number[],
  location:    string,
  displaySize: [number, number],
): [number, number] {
  const meta = NUSCENES_MAP_META[location]
  if (!meta) return [0, 0]

  const [canvasW, canvasH] = meta.canvasEdge
  const [dispW, dispH]     = displaySize

  const px =  (translation[0] / canvasW) * dispW
  const py = (1 - translation[1] / canvasH) * dispH  // Y軸反転

  return [px, py]
}

/**
 * グローバルメートル座標 → マップ元画像ピクセル座標
 * devkit の MapMask.to_pixel_coords() と同じ変換
 *   px =  x / resolution
 *   py = -y / resolution + canvasH_px
 */
export function globalToMapPixel(
  x:        number,
  y:        number,
  location: string,
): [number, number] | null {
  const meta = NUSCENES_MAP_META[location]
  if (!meta) return null
  const { canvasEdge, resolution } = meta
  const canvasH_px = canvasEdge[1] / resolution
  return [
    x / resolution,
    -y / resolution + canvasH_px,
  ]
}

/**
 * BEV 表示範囲に対応する basemap の切り出し領域を計算する
 *
 * @param egoPose        自車グローバル座標 [x, y, z]
 * @param bevRangeMeters BEV 表示の半径（メートル）
 * @param location       マップロケーション名
 * @param bitmapSize     basemap 画像サイズ [width, height]
 * @returns              切り出し領域 {sx, sy, sw, sh}、ロケーション不明なら null
 */
export function calcBasemapCrop(
  egoPose:        number[],
  bevRangeMeters: number,
  location:       string,
  bitmapSize:     [number, number],
): { sx: number; sy: number; sw: number; sh: number } | null {
  const meta = NUSCENES_MAP_META[location]
  if (!meta) return null

  const [canvasW, canvasH] = meta.canvasEdge
  const [bmpW, bmpH]       = bitmapSize

  const [cx, cy] = egoPoseToPixel(egoPose, location, bitmapSize)

  const rangeX = bevRangeMeters * (bmpW / canvasW)
  const rangeY = bevRangeMeters * (bmpH / canvasH)

  return {
    sx: Math.round(cx - rangeX),
    sy: Math.round(cy - rangeY),
    sw: Math.round(rangeX * 2),
    sh: Math.round(rangeY * 2),
  }
}

/**
 * 3D バウンディングボックスの8頂点をグローバル座標で返す
 *
 * @param translation  BBox 中心のグローバル座標 [x, y, z]
 * @param rotation     BBox の向き [w, x, y, z]（クォータニオン）
 * @param size         [width, length, height]（nuScenes 定義）
 * @returns            8頂点のグローバル座標（各頂点は [x, y, z]）
 *
 * 頂点順は devkit Box.corners() と同じ:
 *   0-3: 上面（z = +h/2）、4-7: 下面（z = -h/2）
 *   各面は [前右, 前左, 後左, 後右] の順（x=前方, y=左方向）
 */
export function bboxCornersToGlobal(
  translation: number[],
  rotation:    number[],
  size:        number[],
): number[][] {
  const [w, l, h] = size
  const hw = w / 2
  const hl = l / 2
  const hh = h / 2

  // devkit Box.corners() と完全に同じ頂点順序
  const xs = [ hl,  hl,  hl,  hl, -hl, -hl, -hl, -hl]
  const ys = [ hw, -hw, -hw,  hw,  hw, -hw, -hw,  hw]
  const zs = [ hh,  hh, -hh, -hh,  hh,  hh, -hh, -hh]
  const localCorners: number[][] = xs.map((x, i) => [x, ys[i], zs[i]])

  const R = quatToRotMat(rotation)

  return localCorners.map((c) => {
    const rotated = matVecMul(R, c)
    return [
      rotated[0] + translation[0],
      rotated[1] + translation[1],
      rotated[2] + translation[2],
    ]
  })
}

// 各マップのGPS原点（backend/config/settings.yml と同じ値）
const MAP_ORIGINS: Record<string, [number, number]> = {
  'boston-seaport':           [42.336849169438615, -71.05785369873047],
  'singapore-onenorth':       [1.2882100888758645,  103.78475189208984],
  'singapore-hollandvillage': [1.2993652317780957,  103.78252056121826],
  'singapore-queenstown':     [1.2782562240223188,  103.76741409301758],
}

/**
 * NuScenes メートル座標 → WGS84 経緯度
 * backend/app/converters/geometry.py の local_to_wgs84 と同じ変換
 * @returns [longitude, latitude]（GeoJSON 順）
 */
export function localToWgs84(
  x:        number,
  y:        number,
  location: string,
): [number, number] | null {
  const origin = MAP_ORIGINS[location]
  if (!origin) return null
  const [lat0, lon0] = origin
  const lat = lat0 + y / 111320.0
  const lon = lon0 + x / (111320.0 * Math.cos((lat0 * Math.PI) / 180))
  return [lon, lat]
}

/**
 * basemap PNG の WGS84 bounds を返す（BitmapLayer の bounds に使用）
 * basemap PNG はメートル座標系で (0,0)〜(canvasW, canvasH) の範囲をカバーする
 * @returns [west, south, east, north]
 */
export function getBasemapBounds(
  location: string,
): [number, number, number, number] | null {
  const meta = NUSCENES_MAP_META[location]
  if (!meta) return null

  const [canvasW, canvasH] = meta.canvasEdge
  const sw = localToWgs84(0,       0,       location)  // 南西（左下）
  const ne = localToWgs84(canvasW, canvasH, location)  // 北東（右上）
  if (!sw || !ne) return null

  return [sw[0], sw[1], ne[0], ne[1]]
}

/**
 * WGS84 経緯度 → NuScenes メートル座標
 * backend/app/converters/geometry.py の wgs84_to_local と同じ変換（localToWgs84 の逆）
 * @returns [x, y]（ローカルメートル座標）
 */
export function wgs84ToLocal(
  lon:      number,
  lat:      number,
  location: string,
): [number, number] | null {
  const origin = MAP_ORIGINS[location]
  if (!origin) return null
  const [lat0, lon0] = origin
  const y = (lat - lat0) * 111320.0
  const x = (lon - lon0) * 111320.0 * Math.cos((lat0 * Math.PI) / 180)
  return [x, y]
}

/**
 * GeoJSON 座標列（WGS84）をカメラ画像上の 2D 座標に変換する。
 *
 * nuscenes devkit の NuScenesMapExplorer.render_map_in_image と同じ変換パイプライン:
 *   WGS84 → ローカルメートル座標 (z=0) → エゴ座標系 → カメラ座標系 → 画像 2D
 *
 * 以下の場合は null を返す（ポリゴン・ライン全体をスキップ）:
 *   - いずれかの点がカメラ後方（z < near_plane）
 *   - 変換後の全点が画像外
 *   - 未対応ロケーション
 *
 * @param coords      GeoJSON 座標列 [[lon, lat], ...] (WGS84)
 * @param location    マップロケーション名 ('boston-seaport' 等)
 * @param egoPose     自車位置・姿勢 { translation: [x,y,z], rotation: [w,x,y,z] }
 * @param calibSensor カメラのキャリブレーション { translation: [x,y,z], rotation: [w,x,y,z] }
 * @param intrinsic   カメラ内部パラメータ 3×3 行列
 * @param imageSize   画像サイズ [width, height]
 * @returns           カメラ画像上の 2D 座標列 [[u, v], ...] または null
 */
export function projectMapCoordsToCamera(
  coords:          [number, number][],
  location:        string,
  egoPose:         { translation: number[]; rotation: number[] },
  calibSensor:     { translation: number[]; rotation: number[] },
  intrinsic:       number[][],
  imageSize:       [number, number],
  maxDistanceM?:   number,
  isPolygonRing?:  boolean,
): [number, number][] | null {
  // 未対応ロケーションは早期リターン
  if (coords.length > 0 && !wgs84ToLocal(coords[0][0], coords[0][1], location)) return null

  // 距離フィルタ: 頂点距離チェック + セグメント最短距離チェック
  // （長いラインが ego 直下を通る場合、頂点が遠くてもセグメントが近ければ表示する）
  if (maxDistanceM !== undefined) {
    const egoX = egoPose.translation[0]
    const egoY = egoPose.translation[1]
    const localCoords: [number, number][] = []
    let minDist = Infinity
    for (const [lon, lat] of coords) {
      const local = wgs84ToLocal(lon, lat, location)
      if (!local) continue
      localCoords.push(local)
      const d = Math.sqrt((local[0] - egoX) ** 2 + (local[1] - egoY) ** 2)
      if (d < minDist) minDist = d
    }
    // 頂点が全て閾値外の場合、各セグメントの最短距離も確認
    if (minDist > maxDistanceM) {
      for (let i = 0; i < localCoords.length - 1; i++) {
        const [ax, ay] = localCoords[i]
        const [bx, by] = localCoords[i + 1]
        const dx = bx - ax, dy = by - ay
        const lenSq = dx * dx + dy * dy
        if (lenSq === 0) continue
        const t = Math.max(0, Math.min(1, ((egoX - ax) * dx + (egoY - ay) * dy) / lenSq))
        const sd = Math.sqrt((egoX - ax - t * dx) ** 2 + (egoY - ay - t * dy) ** 2)
        if (sd < minDist) minDist = sd
      }
      if (minDist > maxDistanceM) return null
    }
  }

  const [imgW, imgH] = imageSize

  if (isPolygonRing) {
    // ── ポリゴンリング: Sutherland-Hodgman ニアプレーンクリッピング ──────────
    // WGS84 → ローカル → カメラ座標系
    const camPts: number[][] = []
    for (const [lon, lat] of coords) {
      const local = wgs84ToLocal(lon, lat, location)
      if (!local) return null  // ロケーション不明は全体スキップ
      camPts.push(localToCamera([local[0], local[1], 0], egoPose, calibSensor))
    }

    // ニアプレーンでクリップ
    const clipped = clipPolygonNear(camPts, NEAR_PLANE)
    if (clipped.length < 3) return null

    // 透視投影
    const projected = clipped.map((p): [number, number] => [
      intrinsic[0][0] * (p[0] / p[2]) + intrinsic[0][2],
      intrinsic[1][1] * (p[1] / p[2]) + intrinsic[1][2],
    ])

    // 全点が画像外ならスキップ
    const anyInside = projected.some(([u, v]) => u >= 0 && u < imgW && v >= 0 && v < imgH)
    if (!anyInside) return null

    return projected
  }

  // ── ライン / ポイント: カメラ空間でニアプレーンクリッピング ──────────────
  // 頂点スキップでなく交点計算を行うことで、後方をまたぐラインも正しく描画する
  const camPts: number[][] = []
  for (const [lon, lat] of coords) {
    const local = wgs84ToLocal(lon, lat, location)
    if (!local) continue
    camPts.push(localToCamera([local[0], local[1], 0], egoPose, calibSensor))
  }

  const clipped = clipPolylineNear(camPts, NEAR_PLANE)
  if (clipped.length === 0) return null

  const projected = clipped.map((p): [number, number] => [
    intrinsic[0][0] * (p[0] / p[2]) + intrinsic[0][2],
    intrinsic[1][1] * (p[1] / p[2]) + intrinsic[1][2],
  ])

  const anyInside = projected.some(([u, v]) => u >= 0 && u < imgW && v >= 0 && v < imgH)
  if (!anyInside) return null

  return projected
}

/**
 * グローバル座標をセンサー座標系に変換する（BEV BBox 描画用）
 *
 * @param point       グローバル座標 [x, y, z]
 * @param egoPose     自車位置 { translation: [x,y,z], rotation: [w,x,y,z] }
 * @param calibSensor キャリブレーション済みセンサー { translation: [x,y,z], rotation: [w,x,y,z] }
 * @returns           センサー座標系での [x, y, z]
 */
export function globalToSensor(
  point:       number[],
  egoPose:     { translation: number[]; rotation: number[] },
  calibSensor: { translation: number[]; rotation: number[] },
): number[] {
  // グローバル → エゴ座標系
  const R_ego = quatToRotMat(egoPose.rotation)
  const R_ego_T: number[][] = [
    [R_ego[0][0], R_ego[1][0], R_ego[2][0]],
    [R_ego[0][1], R_ego[1][1], R_ego[2][1]],
    [R_ego[0][2], R_ego[1][2], R_ego[2][2]],
  ]
  const p_ego = matVecMul(R_ego_T, vecSub(point, egoPose.translation))

  // エゴ → センサー座標系
  const R_cs = quatToRotMat(calibSensor.rotation)
  const R_cs_T: number[][] = [
    [R_cs[0][0], R_cs[1][0], R_cs[2][0]],
    [R_cs[0][1], R_cs[1][1], R_cs[2][1]],
    [R_cs[0][2], R_cs[1][2], R_cs[2][2]],
  ]
  return matVecMul(R_cs_T, vecSub(p_ego, calibSensor.translation))
}
