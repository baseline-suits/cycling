import { useEffect, useMemo, useRef, useState } from 'react'
import { Box } from '@mui/material'
import maplibregl from 'maplibre-gl'
import type { TrackPoint } from '../api'
import type { AchievementInfo, OverlayTheme } from './types'
import type { OverlayPalette } from './design'
import { gpsPoints, RouteArtwork } from './RouteArtwork'

const mapStyle = import.meta.env.VITE_SHARE_MAP_STYLE_URL
  ?? import.meta.env.VITE_MAP_STYLE_URL
  ?? 'https://tiles.openfreemap.org/styles/liberty'

export function ShareMap({
  points,
  theme,
  palette,
  showRoute,
  achievement,
}: {
  points: TrackPoint[]
  theme: OverlayTheme
  palette: OverlayPalette
  showRoute: boolean
  achievement?: AchievementInfo | null
}) {
  const container = useRef<HTMLDivElement>(null)
  const [snapshot, setSnapshot] = useState<string | null>(null)
  const coordinates = useMemo(() => gpsPoints(points).map((point) => [point.longitude, point.latitude] as [number, number]), [points])

  useEffect(() => {
    if (!container.current || coordinates.length < 2) return
    setSnapshot(null)
    let cancelled = false
    let timeout: number | undefined
    const map = new maplibregl.Map({
      container: container.current,
      style: mapStyle,
      center: coordinates[0],
      zoom: 10,
      attributionControl: false,
      interactive: false,
      canvasContextAttributes: { preserveDrawingBuffer: true },
      fadeDuration: 0,
    })
    const capture = () => {
      if (cancelled) return
      try { setSnapshot(map.getCanvas().toDataURL('image/png')) } catch { setSnapshot(null) }
    }
    map.on('load', () => {
      if (showRoute) {
        map.addSource('share-route', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates } } })
        map.addLayer({ id: 'share-route-halo', type: 'line', source: 'share-route', paint: { 'line-color': theme === 'dark' ? '#061E1D' : '#FFFFFF', 'line-width': 9, 'line-opacity': .86 }, layout: { 'line-cap': 'round', 'line-join': 'round' } })
        map.addLayer({ id: 'share-route-line', type: 'line', source: 'share-route', paint: { 'line-color': theme === 'dark' ? '#B9E878' : '#5E7F1C', 'line-width': 5 }, layout: { 'line-cap': 'round', 'line-join': 'round' } })
      }
      const bounds = coordinates.reduce((value, point) => value.extend(point), new maplibregl.LngLatBounds(coordinates[0], coordinates[0]))
      map.fitBounds(bounds, { padding: 70, maxZoom: 15, duration: 0 })
      map.once('idle', capture)
      timeout = window.setTimeout(capture, 3500)
    })
    map.on('error', () => undefined)
    return () => {
      cancelled = true
      if (timeout) window.clearTimeout(timeout)
      map.remove()
    }
  }, [coordinates, showRoute, theme])

  return (
    <Box sx={{ position: 'absolute', inset: 0, overflow: 'hidden', bgcolor: theme === 'dark' ? '#18322F' : '#DDE9E1' }}>
      <Box sx={{ position: 'absolute', inset: 0, p: '8%', opacity: snapshot ? 0 : 1 }}>
        {showRoute && <RouteArtwork points={points} color={palette.accent} halo={palette.routeHalo} accent={palette.achievement} achievement={achievement} />}
      </Box>
      {snapshot && <Box component="img" src={snapshot} alt="" sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: theme === 'dark' ? 'brightness(.62) saturate(.7) contrast(1.1)' : 'saturate(.72) brightness(1.03)' }} />}
      <Box ref={container} data-overlay-export-ignore="true" sx={{ position: 'absolute', inset: 0, opacity: 0, pointerEvents: 'none' }} />
      {snapshot && <Box sx={{ position: 'absolute', right: 8, bottom: 5, px: .5, borderRadius: .5, bgcolor: 'rgba(255,255,255,.65)', color: '#253330', fontSize: 6, lineHeight: 1.4 }}>© OpenFreeMap · © OpenStreetMap</Box>}
    </Box>
  )
}
