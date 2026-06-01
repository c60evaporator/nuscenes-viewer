// Configuration source: frontend/config/settings.yml
// Update both files when changing values.

export const MAP_PROJECTION = {
  MAX_DISTANCE_M: 75,
} as const

export const ANNOTATION = {
  EDITING_ORIGINAL_OPACITY: 0.3,
  DEFAULT_BBOX_SIZES: {
    'animal':                      [1.0,  1.0,  1.0],
    'human':                       [0.5,  0.5,  1.7],
    'movable_object':              [1.0,  1.0,  1.0],
    'vehicle.bicycle':             [0.5,  1.8,  1.0],
    'vehicle.motorcycle':          [0.8,  2.0,  1.2],
    'vehicle.car':                 [1.8,  4.5,  1.5],
    'vehicle.emergency.ambulance': [2.0,  5.0,  1.8],
    'vehicle.emergency.police':    [2.0,  5.0,  1.8],
    'vehicle.bus':                 [2.5, 12.0,  3.5],
    'vehicle.truck':               [2.5,  8.0,  3.5],
    'vehicle.trailer':             [2.5, 12.0,  3.5],
    'default':                     [1.0,  1.0,  1.0],
  } as Record<string, [number, number, number]>,
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
