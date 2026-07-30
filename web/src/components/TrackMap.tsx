import { useEffect, useMemo, useRef, useState } from 'react'
import LocationOffRoundedIcon from '@mui/icons-material/LocationOffRounded'
import { Box, Stack, Typography } from '@mui/material'
import maplibregl from 'maplibre-gl'
import type { TrackPoint } from '../api'

const mapStyle = import.meta.env.VITE_MAP_STYLE_URL ?? 'https://tiles.openfreemap.org/styles/liberty'

type CoordinateEntry = {
  coordinate: [number, number]
  distanceM: number
  sourceIndex: number
}

export type TrackMapSelection = {
  startIndex: number
  endIndex: number
}

export type TrackMapMarker = {
  id: string
  latitude: number
  longitude: number
  label?: string | null
  color?: string
}

type TrackMapProps = {
  points: TrackPoint[]
  activePointIndex?: number | null
  selectedRange?: TrackMapSelection | null
  showKilometerMarkers?: boolean
  markers?: TrackMapMarker[]
  onPointHover?: (sourceIndex: number) => void
  height?: { xs: number; md: number } | number
  variant?: 'classic' | 'minimal'
}

function haversineDistance(
  first: Pick<TrackPoint, 'latitude' | 'longitude'>,
  second: Pick<TrackPoint, 'latitude' | 'longitude'>,
) {
  if (
    typeof first.latitude !== 'number' || typeof first.longitude !== 'number'
    || typeof second.latitude !== 'number' || typeof second.longitude !== 'number'
  ) return 0

  const radians = (degrees: number) => degrees * Math.PI / 180
  const earthRadiusM = 6_371_000
  const latitudeDelta = radians(second.latitude - first.latitude)
  const longitudeDelta = radians(second.longitude - first.longitude)
  const latitudeA = radians(first.latitude)
  const latitudeB = radians(second.latitude)
  const value = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(latitudeA) * Math.cos(latitudeB) * Math.sin(longitudeDelta / 2) ** 2
  return earthRadiusM * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value))
}

function coordinateEntries(points: TrackPoint[]): CoordinateEntry[] {
  let cumulativeDistance = 0
  let previousPoint: TrackPoint | null = null
  let previousRawDistance: number | null = null

  return points.flatMap((point, sourceIndex) => {
    if (typeof point.distance_m === 'number' && Number.isFinite(point.distance_m)) {
      if (previousRawDistance == null) cumulativeDistance = Math.max(cumulativeDistance, point.distance_m)
      else if (point.distance_m >= previousRawDistance) cumulativeDistance += point.distance_m - previousRawDistance
      previousRawDistance = point.distance_m
    } else if (previousPoint) {
      cumulativeDistance += haversineDistance(previousPoint, point)
    }
    previousPoint = point

    if (typeof point.longitude !== 'number' || typeof point.latitude !== 'number') return []
    return [{
      coordinate: [point.longitude, point.latitude] as [number, number],
      distanceM: cumulativeDistance,
      sourceIndex,
    }]
  })
}

function emptyFeatureCollection() {
  return { type: 'FeatureCollection' as const, features: [] }
}

export function TrackMap({
  points,
  activePointIndex = null,
  selectedRange = null,
  showKilometerMarkers = false,
  markers = [],
  onPointHover,
  height = { xs: 340, md: 440 },
  variant = 'classic',
}: TrackMapProps) {
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const activeMarkerRef = useRef<maplibregl.Marker | null>(null)
  const selectionMarkersRef = useRef<maplibregl.Marker[]>([])
  const kilometerMarkersRef = useRef<maplibregl.Marker[]>([])
  const extraMarkersRef = useRef<maplibregl.Marker[]>([])
  const hoverCallbackRef = useRef(onPointHover)
  const [mapReady, setMapReady] = useState(false)
  const entries = useMemo(() => coordinateEntries(points), [points])
  const coordinates = useMemo(() => entries.map((entry) => entry.coordinate), [entries])
  const minimal = variant === 'minimal'

  useEffect(() => {
    hoverCallbackRef.current = onPointHover
  }, [onPointHover])

  useEffect(() => {
    if (!container.current || coordinates.length < 2) return
    setMapReady(false)
    const map = new maplibregl.Map({
      container: container.current,
      style: mapStyle,
      center: coordinates[0],
      zoom: 11,
      attributionControl: false,
      cooperativeGestures: minimal,
      dragRotate: !minimal,
    })
    mapRef.current = map
    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-right')
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right')

    map.on('load', () => {
      map.addSource('route', {
        type: 'geojson',
        data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates } },
      })
      map.addLayer({
        id: 'route-glow',
        type: 'line',
        source: 'route',
        paint: { 'line-color': minimal ? '#061E1D' : '#FFFFFF', 'line-width': 8, 'line-opacity': .86 },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      })
      map.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route',
        paint: { 'line-color': minimal ? '#B9E878' : '#5E7F1C', 'line-width': 4, 'line-opacity': .9 },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      })
      map.addSource('selected-route', { type: 'geojson', data: emptyFeatureCollection() })
      map.addLayer({
        id: 'selected-route-glow',
        type: 'line',
        source: 'selected-route',
        paint: { 'line-color': minimal ? '#061E1D' : '#FFFFFF', 'line-width': 10, 'line-opacity': .94 },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      })
      map.addLayer({
        id: 'selected-route-line',
        type: 'line',
        source: 'selected-route',
        paint: { 'line-color': minimal ? '#82AEDA' : '#4D82BC', 'line-width': 6 },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      })
      map.addSource('track-points', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: entries.map((entry) => ({
            type: 'Feature' as const,
            properties: { sourceIndex: entry.sourceIndex },
            geometry: { type: 'Point' as const, coordinates: entry.coordinate },
          })),
        },
      })
      map.addLayer({
        id: 'track-hit-area',
        type: 'circle',
        source: 'track-points',
        paint: { 'circle-radius': 11, 'circle-color': '#5E7F1C', 'circle-opacity': .001 },
      })

      map.on('mouseenter', 'track-hit-area', () => { map.getCanvas().style.cursor = 'crosshair' })
      map.on('mouseleave', 'track-hit-area', () => { map.getCanvas().style.cursor = '' })
      map.on('mousemove', 'track-hit-area', (event) => {
        const sourceIndex = Number(event.features?.[0]?.properties?.sourceIndex)
        if (Number.isFinite(sourceIndex)) hoverCallbackRef.current?.(sourceIndex)
      })

      new maplibregl.Marker({ color: minimal ? '#B9E878' : '#B9E878' }).setLngLat(coordinates[0]).addTo(map)
      new maplibregl.Marker({ color: minimal ? '#E89586' : '#E26D5A' }).setLngLat(coordinates.at(-1)!).addTo(map)
      const bounds = coordinates.reduce(
        (current, coordinate) => current.extend(coordinate),
        new maplibregl.LngLatBounds(coordinates[0], coordinates[0]),
      )
      map.fitBounds(bounds, { padding: 52, maxZoom: 15, duration: 0 })
      setMapReady(true)
    })

    return () => {
      activeMarkerRef.current?.remove()
      activeMarkerRef.current = null
      selectionMarkersRef.current.forEach((marker) => marker.remove())
      selectionMarkersRef.current = []
      kilometerMarkersRef.current.forEach((marker) => marker.remove())
      kilometerMarkersRef.current = []
      extraMarkersRef.current.forEach((marker) => marker.remove())
      extraMarkersRef.current = []
      mapRef.current = null
      map.remove()
    }
  }, [coordinates, entries, minimal])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return

    kilometerMarkersRef.current.forEach((marker) => marker.remove())
    kilometerMarkersRef.current = []
    if (!showKilometerMarkers || !entries.length) return

    const totalKilometres = Math.floor(entries.at(-1)!.distanceM / 1000)
    const markerStep = minimal ? (totalKilometres > 20 ? 5 : totalKilometres > 10 ? 2 : 1) : 1
    let entryIndex = 0
    for (let kilometre = markerStep; kilometre <= totalKilometres; kilometre += markerStep) {
      while (entryIndex < entries.length - 1 && entries[entryIndex].distanceM < kilometre * 1000) entryIndex += 1
      const element = document.createElement('div')
      element.textContent = String(kilometre)
      element.title = `${kilometre} km`
      Object.assign(element.style, {
        alignItems: 'center',
        background: minimal ? '#111817' : '#FFFFFF',
        border: `2px solid ${minimal ? '#B9E878' : '#5E7F1C'}`,
        borderRadius: '999px',
        boxShadow: '0 2px 8px rgba(23, 35, 34, .2)',
        color: minimal ? '#F3F7F6' : '#080A0D',
        display: 'flex',
        font: '700 10px Manrope, sans-serif',
        height: '24px',
        justifyContent: 'center',
        width: '24px',
      })
      kilometerMarkersRef.current.push(
        new maplibregl.Marker({ element }).setLngLat(entries[entryIndex].coordinate).addTo(map),
      )
    }
  }, [entries, mapReady, minimal, showKilometerMarkers])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    extraMarkersRef.current.forEach((marker) => marker.remove())
    extraMarkersRef.current = markers.map((marker) => {
      const mapMarker = new maplibregl.Marker({ color: marker.color ?? (minimal ? '#EBC477' : '#E9A23B'), scale: .8 })
        .setLngLat([marker.longitude, marker.latitude])
      if (marker.label) {
        mapMarker.setPopup(new maplibregl.Popup({ offset: 18 }).setText(marker.label))
      }
      return mapMarker.addTo(map)
    })
  }, [mapReady, markers, minimal])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    activeMarkerRef.current?.remove()
    activeMarkerRef.current = null
    if (activePointIndex == null) return
    const activeEntry = entries.find((entry) => entry.sourceIndex === activePointIndex)
    if (!activeEntry) return
    activeMarkerRef.current = new maplibregl.Marker({ color: minimal ? '#EBC477' : '#E9A23B', scale: .82 })
      .setLngLat(activeEntry.coordinate)
      .addTo(map)
  }, [activePointIndex, entries, mapReady, minimal])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    selectionMarkersRef.current.forEach((marker) => marker.remove())
    selectionMarkersRef.current = []

    const start = selectedRange ? Math.min(selectedRange.startIndex, selectedRange.endIndex) : -1
    const end = selectedRange ? Math.max(selectedRange.startIndex, selectedRange.endIndex) : -1
    const selectedEntries = selectedRange
      ? entries.filter((entry) => entry.sourceIndex >= start && entry.sourceIndex <= end)
      : []
    const source = map.getSource('selected-route') as maplibregl.GeoJSONSource | undefined
    source?.setData(selectedEntries.length >= 2 ? {
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: selectedEntries.map((entry) => entry.coordinate) },
    } : emptyFeatureCollection())

    if (selectedEntries.length >= 2) {
      selectionMarkersRef.current = [
        new maplibregl.Marker({ color: minimal ? '#82AEDA' : '#4D82BC', scale: .65 }).setLngLat(selectedEntries[0].coordinate).addTo(map),
        new maplibregl.Marker({ color: minimal ? '#82AEDA' : '#4D82BC', scale: .65 }).setLngLat(selectedEntries.at(-1)!.coordinate).addTo(map),
      ]
    }
  }, [entries, mapReady, minimal, selectedRange])

  if (coordinates.length < 2) {
    return (
      <Stack alignItems="center" justifyContent="center" spacing={1} sx={{ height, bgcolor: minimal ? 'var(--avento-minimal-surface-subtle)' : 'background.default' }}>
        <LocationOffRoundedIcon color="disabled" fontSize="large" />
        <Typography color="text.secondary">Diese Aktivität enthält keine GPS-Strecke.</Typography>
      </Stack>
    )
  }

  return <Box ref={container} role="region" tabIndex={0} aria-label="Karte der gefahrenen Strecke. Eine Textalternative ist darunter verfügbar." data-map-variant={variant} sx={{ width: '100%', height, minHeight: 240, '& .maplibregl-ctrl button:focus-visible': { outline: '2px solid #B9E878', outlineOffset: 2 } }} />
}
