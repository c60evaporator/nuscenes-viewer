// Configuration source: frontend/config/settings.yml
// Update both files when changing values.

export const MAP_PROJECTION = {
  MAX_DISTANCE_M: 75,
} as const

export const ANNOTATION = {
  EDITING_ORIGINAL_OPACITY: 0.3,
} as const

// 下から上への描画順。settings.yml の layer_display_order と同期すること
export const LAYER_DISPLAY_ORDER = [
  'drivable_area',
  'road_block',
  'road_segment',
  'carpark_area',
  'walkway',
  'ped_crossing',
  'stop_line',
  'lane_connector',
  'lane',
  'road_divider',
  'lane_divider',
  'traffic_light',
] as const
