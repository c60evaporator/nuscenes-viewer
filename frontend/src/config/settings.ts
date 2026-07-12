import rawSettings from '../../config/settings.yml'

interface SettingsYml {
  map_projection: { max_distance_m: number }
  layer_display_order: string[]
  annotation: {
    editing_original_opacity: number
    category_order: string[]
    default_bbox_sizes: Record<string, [number, number, number]>
    translation_extrapolation_max: number
    default_forward_distance: number
  }
}

const s = rawSettings as unknown as SettingsYml

export const MAP_PROJECTION = {
  MAX_DISTANCE_M: s.map_projection.max_distance_m,
} as const

export const ANNOTATION = {
  EDITING_ORIGINAL_OPACITY: s.annotation.editing_original_opacity,
  CATEGORY_ORDER:            s.annotation.category_order as string[],
  DEFAULT_BBOX_SIZES:        s.annotation.default_bbox_sizes as Record<string, [number, number, number]>,
  TRANSLATION_EXTRAPOLATION_MAX: s.annotation.translation_extrapolation_max,
  DEFAULT_FORWARD_DISTANCE:      s.annotation.default_forward_distance,
} as const

export const LAYER_DISPLAY_ORDER = s.layer_display_order as string[]
