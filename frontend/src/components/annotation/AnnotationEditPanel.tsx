import { useVisibilities, useAttributes } from '@/api/annotations'
import { useCategories } from '@/api/categories'
import { useInstances } from '@/api/instances'
import { useSceneSamples } from '@/api/scenes'
import { quaternionToEulerDeg } from '@/lib/coordinateUtils'
import type { Annotation } from '@/types/annotation'

interface Props {
  annotation: Annotation | null
  sceneToken: string | null
}

// ── スタイル定数 ────────────────────────────────────────────────────────────

const BTN: React.CSSProperties = {
  padding:         '5px 0',
  background:      '#374151',
  color:           '#6B7280',
  border:          '1px solid #4B5563',
  borderRadius:    '3px',
  cursor:          'not-allowed',
  fontSize:        '13px',
  fontWeight:      'bold',
  lineHeight:      1,
}

const INPUT: React.CSSProperties = {
  flex:            1,
  minWidth:        0,
  padding:         '2px 4px',
  background:      '#1F2937',
  color:           '#9CA3AF',
  border:          '1px solid #374151',
  borderRadius:    '3px',
  fontSize:        '11px',
  textAlign:       'right' as const,
}

const SELECT: React.CSSProperties = {
  width:           '100%',
  padding:         '2px 4px',
  background:      '#1F2937',
  color:           '#9CA3AF',
  border:          '1px solid #374151',
  borderRadius:    '3px',
  fontSize:        '11px',
}

const LABEL: React.CSSProperties = {
  width:           '72px',
  flexShrink:      0,
  fontSize:        '11px',
  color:           '#9CA3AF',
  paddingTop:      '2px',
}

const ROW: React.CSSProperties = {
  display:         'flex',
  alignItems:      'flex-start',
  gap:             '4px',
  marginBottom:    '5px',
}

const READONLY_VAL: React.CSSProperties = {
  flex:            1,
  fontSize:        '11px',
  color:           '#6B7280',
  wordBreak:       'break-all',
  paddingTop:      '2px',
}

// ── サブコンポーネント ───────────────────────────────────────────────────────

function TripleInputRow({ label, vals, placeholders }: {
  label:        string
  vals:         (string | number)[]
  placeholders: string[]
}) {
  return (
    <div style={{ marginBottom: '5px' }}>
      <span style={{ fontSize: '11px', color: '#9CA3AF', display: 'block', marginBottom: '2px' }}>
        {label}
      </span>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '3px' }}>
        {vals.map((v, i) => (
          <input
            key={i}
            disabled
            value={v}
            placeholder={placeholders[i]}
            style={{ ...INPUT, textAlign: 'center' }}
            onChange={() => {}}
          />
        ))}
      </div>
    </div>
  )
}

function ReadOnlyRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div style={ROW}>
      <span style={LABEL}>{label}</span>
      <span style={READONLY_VAL}>{value ?? '—'}</span>
    </div>
  )
}

// ── メインコンポーネント ────────────────────────────────────────────────────

export default function AnnotationEditPanel({ annotation, sceneToken }: Props) {
  const { data: visibilities = [] } = useVisibilities()
  const { data: attributes   = [] } = useAttributes()
  const { data: categories   = [] } = useCategories()
  const { data: samples      = [] } = useSceneSamples(sceneToken)
  const { data: instancesRes }      = useInstances({ sceneToken: sceneToken ?? undefined, limit: 500 })
  const instances = instancesRes?.items ?? []

  const euler = annotation?.rotation && annotation.rotation.length === 4
    ? quaternionToEulerDeg(annotation.rotation)
    : null

  const fmt3 = (v: number | undefined) => (v !== undefined ? v.toFixed(3) : '')
  const checkedAttrTokens = new Set((annotation?.attributes ?? []).map((a) => a.token))

  const sampleLabel = (token: string) => {
    const s = samples.find((s) => s.token === token)
    if (!s) return token.substring(0, 12) + '...'
    const d = new Date(s.timestamp / 1000)
    return d.toISOString().substring(11, 23)
  }

  return (
    <div style={{
      overflowY:  'auto',
      height:     '100%',
      padding:    '8px',
      fontSize:   '12px',
      color:      '#D1D5DB',
      boxSizing:  'border-box',
    }}>

      {/* ── BBox Ctrl ─────────────────────────────────────────────────── */}
      <div style={{
        border:        '1px solid #374151',
        borderRadius:  '4px',
        padding:       '8px',
        marginBottom:  '10px',
        background:    '#111827',
      }}>
        <div style={{ textAlign: 'center', fontSize: '11px', color: '#9CA3AF', marginBottom: '6px' }}>
          Bounding box ctrl
        </div>
        {/* 回転ボタン行 + 並進ボタン行 */}
        {[
          ['↺', '▲', '↻'],
          ['◄', '▼', '►'],
        ].map((row, ri) => (
          <div key={ri} style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px', marginBottom: '4px' }}>
            {row.map((label) => (
              <button key={label} disabled style={BTN}>{label}</button>
            ))}
          </div>
        ))}
        {/* サイズボタン行 */}
        {[
          ['+W', '+L', '+H'],
          ['−W', '−L', '−H'],
        ].map((row, ri) => (
          <div key={ri} style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px', marginBottom: ri === 0 ? '4px' : 0 }}>
            {row.map((label) => (
              <button key={label} disabled style={BTN}>{label}</button>
            ))}
          </div>
        ))}
      </div>

      {/* ── translation / size / rotation ─────────────────────────────── */}
      <TripleInputRow
        label="translation"
        vals={[fmt3(annotation?.translation[0]), fmt3(annotation?.translation[1]), fmt3(annotation?.translation[2])]}
        placeholders={['x', 'y', 'z']}
      />
      <TripleInputRow
        label="size"
        vals={[fmt3(annotation?.size[0]), fmt3(annotation?.size[1]), fmt3(annotation?.size[2])]}
        placeholders={['W', 'L', 'H']}
      />
      <TripleInputRow
        label="rotation"
        vals={[euler?.yaw ?? '', euler?.pitch ?? '', euler?.roll ?? '']}
        placeholders={['yaw', 'pitch', 'roll']}
      />

      {/* ── visibility ────────────────────────────────────────────────── */}
      <div style={ROW}>
        <span style={LABEL}>visibility</span>
        <select
          disabled
          value={annotation?.visibility_token ?? ''}
          style={SELECT}
          onChange={() => {}}
        >
          <option value="">—</option>
          {visibilities.map((v) => (
            <option key={v.token} value={v.token}>{v.level}</option>
          ))}
        </select>
      </div>

      {/* ── attributes ────────────────────────────────────────────────── */}
      <div style={ROW}>
        <span style={LABEL}>attributes</span>
        <div style={{
          flex:          1,
          border:        '1px solid #374151',
          borderRadius:  '3px',
          padding:       '4px',
          maxHeight:     '90px',
          overflowY:     'auto',
          background:    '#1F2937',
        }}>
          {attributes.length === 0 && (
            <span style={{ fontSize: '11px', color: '#6B7280' }}>—</span>
          )}
          {attributes.map((a) => (
            <label key={a.token} style={{
              display:    'flex',
              alignItems: 'center',
              gap:        '4px',
              cursor:     'not-allowed',
              padding:    '1px 0',
            }}>
              <input
                type="checkbox"
                disabled
                checked={checkedAttrTokens.has(a.token)}
                readOnly
                style={{ accentColor: '#4A90D9', cursor: 'not-allowed' }}
              />
              <span style={{ fontSize: '11px', color: '#9CA3AF' }}>{a.name}</span>
            </label>
          ))}
        </div>
      </div>

      {/* ── sample ────────────────────────────────────────────────────── */}
      <div style={ROW}>
        <span style={LABEL}>sample</span>
        <select
          disabled
          value={annotation?.sample_token ?? ''}
          style={SELECT}
          onChange={() => {}}
        >
          <option value="">—</option>
          {samples.map((s) => (
            <option key={s.token} value={s.token}>{sampleLabel(s.token)}</option>
          ))}
        </select>
      </div>

      {/* ── instance ──────────────────────────────────────────────────── */}
      <div style={ROW}>
        <span style={LABEL}>instance</span>
        <select
          disabled
          value={annotation?.instance_token ?? ''}
          style={SELECT}
          onChange={() => {}}
        >
          <option value="">—</option>
          <option value="__new__">new instance</option>
          {instances.map((inst) => (
            <option key={inst.token} value={inst.token}>
              {inst.category_name} ({inst.token.substring(0, 8)})
            </option>
          ))}
        </select>
      </div>

      {/* ── category ──────────────────────────────────────────────────── */}
      <div style={ROW}>
        <span style={LABEL}>category</span>
        <select
          disabled
          value={annotation?.category_token ?? ''}
          style={SELECT}
          onChange={() => {}}
        >
          <option value="">—</option>
          {categories.map((c) => (
            <option key={c.token} value={c.token}>{c.name}</option>
          ))}
        </select>
      </div>

      {/* ── 読み取り専用フィールド ─────────────────────────────────────── */}
      <div style={{ borderTop: '1px solid #374151', marginTop: '6px', paddingTop: '6px' }}>
        <ReadOnlyRow label="token"          value={annotation?.token} />
        <ReadOnlyRow label="prev"           value={annotation?.prev} />
        <ReadOnlyRow label="next"           value={annotation?.next} />
        <ReadOnlyRow label="lidar_pts"  value={annotation?.num_lidar_pts?.toString()} />
        <ReadOnlyRow label="radar_pts"  value={annotation?.num_radar_pts?.toString()} />
      </div>

      {/* ── Register ボタン ───────────────────────────────────────────── */}
      <button
        disabled
        style={{
          width:         '100%',
          padding:       '8px',
          marginTop:     '10px',
          background:    '#374151',
          color:         '#6B7280',
          border:        'none',
          borderRadius:  '4px',
          cursor:        'not-allowed',
          fontSize:      '13px',
          fontWeight:    'bold',
        }}
      >
        Register the BBox
      </button>
    </div>
  )
}
