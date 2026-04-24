import { GeoJsonLayer } from '@deck.gl/layers'
import type { MapLayer, GeoJSONFeatureCollection, GeoJSONMapFeature } from '@/types/map'

export type RGBA = [number, number, number, number]

export const LAYER_COLORS: Record<MapLayer, RGBA> = {
  drivable_area:  [100, 180, 255, 80],
  road_segment:   [50,  130, 230, 120],
  road_block:     [60,  200, 100, 120],
  lane:           [100, 220, 80,  150],
  lane_connector: [180, 230, 80,  150],
  ped_crossing:   [240, 100, 180, 150],
  walkway:        [220, 60,  60,  150],
  stop_line:      [255, 160, 40,  200],
  carpark_area:   [255, 220, 40,  120],
  road_divider:   [255, 140, 0,   220],
  lane_divider:   [180, 130, 255, 200],
  traffic_light:  [255, 200, 0,   255],
}

export const LAYER_CURSORS: Record<MapLayer, string> = {
  drivable_area:  'pointer',
  road_segment:   'pointer',
  road_block:     'pointer',
  lane:           'pointer',
  lane_connector: 'pointer',
  ped_crossing:   'pointer',
  walkway:        'pointer',
  stop_line:      'pointer',
  carpark_area:   'pointer',
  road_divider:   'crosshair',
  lane_divider:   'crosshair',
  traffic_light:  'pointer',
}

export const LAYER_LABELS: Record<MapLayer, string> = {
  drivable_area:  'Drivable Area',
  road_segment:   'Road Segment',
  road_block:     'Road Block',
  lane:           'Lane',
  lane_connector: 'Lane Connector',
  ped_crossing:   'Ped Crossing',
  walkway:        'Walkway',
  stop_line:      'Stop Line',
  carpark_area:   'Carpark Area',
  road_divider:   'Road Divider',
  lane_divider:   'Lane Divider',
  traffic_light:  'Traffic Light',
}

export function createGeoJsonLayer(
  layer:   MapLayer,
  data:    GeoJSONFeatureCollection,
  onClick: (feature: GeoJSONMapFeature, layerName: MapLayer) => void,
  onHover: (cursor: string | null) => void,
): GeoJsonLayer {
  const color = LAYER_COLORS[layer]
  const lineColor: RGBA = [color[0], color[1], color[2], 255]

  const isDivider = layer === 'road_divider' || layer === 'lane_divider'
  const isPoint   = layer === 'traffic_light'

  return new GeoJsonLayer({
    id:   `geojson-${layer}`,
    // deck.gl GeoJsonLayer accepts GeoJSON; cast through unknown for type compat
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: data as unknown as any,

    pickable:       true,
    autoHighlight:  true,
    highlightColor: [255, 255, 255, 60],
    filled:      !isDivider,
    stroked:     true,

    getFillColor:   color,
    getLineColor:   lineColor,
    getLineWidth:   isDivider ? 2 : 1,
    lineWidthUnits: 'pixels',

    getPointRadius:   isPoint ? 5 : 3,
    pointRadiusUnits: 'pixels',

    onClick: (info) => {
      if (info.object) onClick(info.object as GeoJSONMapFeature, layer)
    },
    onHover: (info) => {
      onHover(info.object ? LAYER_CURSORS[layer] : null)
    },
  })
}
