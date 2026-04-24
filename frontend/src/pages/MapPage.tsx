import { useState } from 'react'
import MainLayout from '@/components/layout/MainLayout'
import LeftPane from '@/components/layout/LeftPane'
import RightPane from '@/components/layout/RightPane'
import LayerCheckboxes from '@/components/map/LayerCheckboxes'
import MapAnnotationInfo from '@/components/map/MapAnnotationInfo'
import MapViewer from '@/components/map/MapViewer'
import { useMapByLocation } from '@/api/maps'
import { useViewerStore } from '@/store/viewerStore'
import type { TabId } from '@/components/layout/Header'
import type { GeoJSONMapFeature, MapLayer } from '@/types/map'

interface MapPageProps {
  activeTab:   TabId
  onTabChange: (tab: TabId) => void
}

function MapMetaInfo({ version, canvasEdge }: { version?: string; canvasEdge?: number[] }) {
  if (!version) return <p className="text-gray-400 text-xs">Map 情報を読み込み中...</p>
  return (
    <div>
      <div className="flex flex-col gap-0.5 py-1 border-b border-white/10">
        <span className="text-gray-400 text-xs">Version</span>
        <span className="text-gray-200 text-xs">{version}</span>
      </div>
      {canvasEdge && (
        <div className="flex flex-col gap-0.5 py-1">
          <span className="text-gray-400 text-xs">Canvas Edge (m)</span>
          <span className="text-gray-200 text-xs">{canvasEdge.join(' × ')}</span>
        </div>
      )}
    </div>
  )
}

export default function MapPage({ activeTab, onTabChange }: MapPageProps) {
  const currentMapLocation = useViewerStore((s) => s.currentMapLocation)
  const { data: mapMeta } = useMapByLocation(currentMapLocation)

  const [selectedFeature, setSelectedFeature] = useState<GeoJSONMapFeature | null>(null)
  const [selectedLayer,   setSelectedLayer]   = useState<MapLayer | null>(null)

  const handleFeatureClick = (feature: GeoJSONMapFeature, layer: MapLayer) => {
    setSelectedFeature(feature)
    setSelectedLayer(layer)
  }

  return (
    <MainLayout
      activeTab={activeTab}
      onTabChange={onTabChange}
      left={
        <LeftPane
          filter={
            <MapMetaInfo
              version={mapMeta?.version}
              canvasEdge={mapMeta?.canvas_edge}
            />
          }
        >
          <LayerCheckboxes />
        </LeftPane>
      }
      right={
        <RightPane>
          <MapAnnotationInfo feature={selectedFeature} layer={selectedLayer} />
        </RightPane>
      }
    >
      <MapViewer
        mapToken={mapMeta?.token ?? null}
        location={currentMapLocation}
        onFeatureClick={handleFeatureClick}
        selectedFeature={selectedFeature}
        selectedLayer={selectedLayer}
      />
    </MainLayout>
  )
}
