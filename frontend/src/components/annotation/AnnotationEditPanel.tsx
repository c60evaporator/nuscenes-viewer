import { useVisibilities, useAttributes } from '@/api/annotations'
import { useCategories } from '@/api/categories'
import { useInstances } from '@/api/instances'
import { useSceneSamples } from '@/api/scenes'
import { quaternionToEulerDeg } from '@/lib/coordinateUtils'
import { useLongPressButton } from '@/hooks/useLongPressButton'
import {
    translateAnnotation,
    rotateAnnotation,
    resizeAnnotation,
} from '@/lib/bboxEditOps'
import { useEditStore } from '@/store/editStore'
import type { Annotation } from '@/types/annotation'
import type { EgoPosePoint } from '@/types/sensor'

interface Props {
  annotation:             Annotation | null
  sceneToken:             string | null
  allowedInstanceTokens?: Set<string> | null
  egoPose?:               EgoPosePoint | null
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

// ── 有効/無効に応じたスタイルヘルパー ──────────────────────────────────────

const inputFor = (enabled: boolean): React.CSSProperties => ({
  ...INPUT,
  color:  enabled ? '#D1D5DB' : INPUT.color,
  border: enabled ? '1px solid #4B5563' : INPUT.border,
  cursor: enabled ? 'text' : 'not-allowed',
})

const selectFor = (enabled: boolean): React.CSSProperties => ({
  ...SELECT,
  color:  enabled ? '#D1D5DB' : SELECT.color,
  border: enabled ? '1px solid #4B5563' : SELECT.border,
  cursor: enabled ? 'pointer' : 'not-allowed',
})

const ctrlBtnFor = (enabled: boolean): React.CSSProperties => ({
  ...BTN,
  background: enabled ? '#2563EB' : BTN.background,
  color:  enabled ? '#FFFFFF' : BTN.color,
  cursor: enabled ? 'pointer' : 'not-allowed',
})

// ── サブコンポーネント ───────────────────────────────────────────────────────

function BBoxButtonRow({ children, last = false }: { children: React.ReactNode; last?: boolean }) {
  return (
    <div style={{
      display:             'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gap:                 '4px',
      marginBottom:        last ? 0 : '4px',
    }}>
      {children}
    </div>
  )
}

function CtrlButton({
  label, enabled, onTick, onRelease,
}: {
  label:     string
  enabled:   boolean
  onTick:    () => void
  onRelease: () => void
}) {
  const press = useLongPressButton({
    onTick:    enabled ? onTick    : () => {},
    onRelease: enabled ? onRelease : () => {},
  })
  return (
    <button
      disabled={!enabled}
      style={ctrlBtnFor(enabled)}
      {...(enabled ? press : {})}
    >
      {label}
    </button>
  )
}

function TripleInputRow({ label, vals, placeholders, enabled = false }: {
  label:        string
  vals:         (string | number)[]
  placeholders: string[]
  enabled?:     boolean
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
            disabled={!enabled}
            value={v}
            placeholder={placeholders[i]}
            style={{ ...inputFor(enabled), textAlign: 'center' }}
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

export default function AnnotationEditPanel({
  annotation, sceneToken, allowedInstanceTokens, egoPose,
}: Props) {
  const { data: visibilities = [] } = useVisibilities()
  const { data: attributes   = [] } = useAttributes()
  const { data: categories   = [] } = useCategories()
  const { data: samples      = [] } = useSceneSamples(sceneToken)
  const { data: instancesRes }      = useInstances({ sceneToken: sceneToken ?? undefined, limit: 500 })
  const instances = instancesRes?.items ?? []

  // editStore
  const editMode            = useEditStore((s) => s.mode)
  const editSession         = useEditStore((s) => s.session)
  const currentAnnotation   = useEditStore((s) => s.getCurrentAnnotation())
  const isDirty             = useEditStore((s) => s.isDirty())
  const endSession          = useEditStore((s) => s.endSession)
  const updateSessionLive   = useEditStore((s) => s.updateSessionLive)
  const commitChange        = useEditStore((s) => s.commitChange)

  // session中はストア優先、それ以外はprops.annotation
  const displayAnnotation = currentAnnotation ?? annotation

  // sessionからの派生値
  const fixedSampleToken     = editSession?.fixedSampleToken     ?? null
  const fixedInstanceToken   = editSession?.fixedInstanceToken   ?? null
  const isInstanceSelectable = editSession?.isInstanceSelectable ?? false

  const euler = displayAnnotation?.rotation && displayAnnotation.rotation.length === 4
    ? quaternionToEulerDeg(displayAnnotation.rotation)
    : null

  const fmt3 = (v: number | undefined) => (v !== undefined ? v.toFixed(3) : '')
  const checkedAttrTokens = new Set((displayAnnotation?.attributes ?? []).map((a) => a.token))

  // ── 有効/無効の判定値 ─────────────────────────────────────────────────────
  const isEditing          = editMode !== 'view'
  const isAdd              = editMode === 'add'
  const ctrlButtonsEnabled = isEditing && currentAnnotation !== null && egoPose != null

  // instance ドロップダウンの表示値・有効状態・選択肢
  const instanceEnabled = isAdd && isInstanceSelectable
  const instanceSelectValue = isEditing
    ? (instanceEnabled
        ? (displayAnnotation?.instance_token === '' ? '__new__' : (displayAnnotation?.instance_token ?? '__new__'))
        : (fixedInstanceToken ?? '__new__'))
    : (displayAnnotation?.instance_token ?? '')
  const instanceOptions = (instanceEnabled && allowedInstanceTokens != null)
    ? instances.filter((i) => allowedInstanceTokens.has(i.token))
    : instances

  // category: instance が '__new__' のときのみ有効
  const categoryEnabled = isEditing && instanceSelectValue === '__new__'
  const fixedInstance   = fixedInstanceToken
    ? (instances.find((i) => i.token === fixedInstanceToken) ?? null)
    : null
  const categorySelectValue = (!categoryEnabled && isEditing)
    ? (fixedInstance?.category_token ?? displayAnnotation?.category_token ?? '')
    : (displayAnnotation?.category_token ?? '')

  // sample: 常に無効だが編集・追加モード時は固定値を表示
  const sampleSelectValue = isEditing
    ? (fixedSampleToken ?? displayAnnotation?.sample_token ?? '')
    : (displayAnnotation?.sample_token ?? '')

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
        {/* 1行目: ↺ ▲ ↻ */}
        <BBoxButtonRow>
          <CtrlButton label="↺" enabled={ctrlButtonsEnabled}
            onTick={() => { if (!currentAnnotation) return; updateSessionLive({ rotation: rotateAnnotation(currentAnnotation, false).rotation }) }}
            onRelease={commitChange} />
          <CtrlButton label="▲" enabled={ctrlButtonsEnabled}
            onTick={() => { if (!currentAnnotation || !egoPose) return; updateSessionLive({ translation: translateAnnotation(currentAnnotation, 'y+', egoPose).translation }) }}
            onRelease={commitChange} />
          <CtrlButton label="↻" enabled={ctrlButtonsEnabled}
            onTick={() => { if (!currentAnnotation) return; updateSessionLive({ rotation: rotateAnnotation(currentAnnotation, true).rotation }) }}
            onRelease={commitChange} />
        </BBoxButtonRow>
        {/* 2行目: ◄ ▼ ► */}
        <BBoxButtonRow>
          <CtrlButton label="◄" enabled={ctrlButtonsEnabled}
            onTick={() => { if (!currentAnnotation || !egoPose) return; updateSessionLive({ translation: translateAnnotation(currentAnnotation, 'x-', egoPose).translation }) }}
            onRelease={commitChange} />
          <CtrlButton label="▼" enabled={ctrlButtonsEnabled}
            onTick={() => { if (!currentAnnotation || !egoPose) return; updateSessionLive({ translation: translateAnnotation(currentAnnotation, 'y-', egoPose).translation }) }}
            onRelease={commitChange} />
          <CtrlButton label="►" enabled={ctrlButtonsEnabled}
            onTick={() => { if (!currentAnnotation || !egoPose) return; updateSessionLive({ translation: translateAnnotation(currentAnnotation, 'x+', egoPose).translation }) }}
            onRelease={commitChange} />
        </BBoxButtonRow>
        {/* 3行目: +W +L +H */}
        <BBoxButtonRow>
          <CtrlButton label="+W" enabled={ctrlButtonsEnabled}
            onTick={() => { if (!currentAnnotation) return; updateSessionLive({ size: resizeAnnotation(currentAnnotation, 0, +1).size }) }}
            onRelease={commitChange} />
          <CtrlButton label="+L" enabled={ctrlButtonsEnabled}
            onTick={() => { if (!currentAnnotation) return; updateSessionLive({ size: resizeAnnotation(currentAnnotation, 1, +1).size }) }}
            onRelease={commitChange} />
          <CtrlButton label="+H" enabled={ctrlButtonsEnabled}
            onTick={() => { if (!currentAnnotation) return; const r = resizeAnnotation(currentAnnotation, 2, +1); updateSessionLive({ size: r.size, translation: r.translation }) }}
            onRelease={commitChange} />
        </BBoxButtonRow>
        {/* 4行目: −W −L −H */}
        <BBoxButtonRow last>
          <CtrlButton label="−W" enabled={ctrlButtonsEnabled}
            onTick={() => { if (!currentAnnotation) return; updateSessionLive({ size: resizeAnnotation(currentAnnotation, 0, -1).size }) }}
            onRelease={commitChange} />
          <CtrlButton label="−L" enabled={ctrlButtonsEnabled}
            onTick={() => { if (!currentAnnotation) return; updateSessionLive({ size: resizeAnnotation(currentAnnotation, 1, -1).size }) }}
            onRelease={commitChange} />
          <CtrlButton label="−H" enabled={ctrlButtonsEnabled}
            onTick={() => { if (!currentAnnotation) return; const r = resizeAnnotation(currentAnnotation, 2, -1); updateSessionLive({ size: r.size, translation: r.translation }) }}
            onRelease={commitChange} />
        </BBoxButtonRow>
      </div>

      {/* ── translation / size / rotation ─────────────────────────────── */}
      <TripleInputRow
        label="translation"
        vals={[fmt3(displayAnnotation?.translation[0]), fmt3(displayAnnotation?.translation[1]), fmt3(displayAnnotation?.translation[2])]}
        placeholders={['x', 'y', 'z']}
        enabled={isEditing}
      />
      <TripleInputRow
        label="size"
        vals={[fmt3(displayAnnotation?.size[0]), fmt3(displayAnnotation?.size[1]), fmt3(displayAnnotation?.size[2])]}
        placeholders={['W', 'L', 'H']}
        enabled={isEditing}
      />
      <TripleInputRow
        label="rotation"
        vals={[euler?.yaw ?? '', euler?.pitch ?? '', euler?.roll ?? '']}
        placeholders={['yaw', 'pitch', 'roll']}
        enabled={isEditing}
      />

      {/* ── visibility ────────────────────────────────────────────────── */}
      <div style={ROW}>
        <span style={LABEL}>visibility</span>
        <select
          disabled={!isEditing}
          value={displayAnnotation?.visibility_token ?? ''}
          style={selectFor(isEditing)}
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
              cursor:     isEditing ? 'pointer' : 'not-allowed',
              padding:    '1px 0',
            }}>
              <input
                type="checkbox"
                disabled={!isEditing}
                checked={checkedAttrTokens.has(a.token)}
                readOnly
                style={{ accentColor: '#4A90D9', cursor: isEditing ? 'pointer' : 'not-allowed' }}
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
          value={sampleSelectValue}
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
          disabled={!instanceEnabled}
          value={instanceSelectValue}
          style={selectFor(instanceEnabled)}
          onChange={() => {}}
        >
          <option value="">—</option>
          <option value="__new__">new instance</option>
          {instanceOptions.map((inst) => (
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
          disabled={!categoryEnabled}
          value={categorySelectValue}
          style={selectFor(categoryEnabled)}
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
        <ReadOnlyRow label="token"      value={displayAnnotation?.token} />
        <ReadOnlyRow label="prev"       value={displayAnnotation?.prev} />
        <ReadOnlyRow label="next"       value={displayAnnotation?.next} />
        <ReadOnlyRow label="lidar_pts"  value={displayAnnotation?.num_lidar_pts?.toString()} />
        <ReadOnlyRow label="radar_pts"  value={displayAnnotation?.num_radar_pts?.toString()} />
      </div>

      {/* ── Save BBox ボタン ──────────────────────────────────────────── */}
      <button
        disabled={!isDirty}
        style={{
          width:         '100%',
          padding:       '8px',
          marginTop:     '10px',
          background:    isDirty ? '#4A90D9' : '#374151',
          color:         isDirty ? '#FFFFFF' : '#6B7280',
          border:        'none',
          borderRadius:  '4px',
          cursor:        isDirty ? 'pointer' : 'not-allowed',
          fontSize:      '13px',
          fontWeight:    'bold',
        }}
        onClick={() => {
          // Step 5以降で実装
          console.log('[Save BBox] not implemented yet', currentAnnotation)
        }}
      >
        Save BBox
      </button>

      {/* ── Cancel Edit ボタン ─────────────────────────────────────────── */}
      {(() => {
        const active = isEditing
        return (
          <button
            disabled={!active}
            onClick={active ? endSession : undefined}
            style={{
              width:         '100%',
              padding:       '8px',
              marginTop:     '6px',
              background:    active ? '#DC2626' : '#374151',
              color:         active ? '#FFFFFF'  : '#6B7280',
              border:        'none',
              borderRadius:  '4px',
              cursor:        active ? 'pointer' : 'not-allowed',
              fontSize:      '13px',
              fontWeight:    'bold',
            }}
          >
            Cancel Edit
          </button>
        )
      })()}
    </div>
  )
}
