import type { Activity, ActivityPhoto, StatisticsOverview, TrackPoint } from '../api'

export type OverlayFormatId = 'square' | 'portrait' | 'story' | 'landscape'
export type OverlayTheme = 'light' | 'dark'
export type OverlayBackground = 'transparent' | 'solid' | 'map' | 'photo'
export type OverlayTemplateId = 'classic' | 'minimal' | 'photo' | 'stats' | 'map' | 'achievement'

export type MetricKey =
  | 'distance'
  | 'movingTime'
  | 'duration'
  | 'elevation'
  | 'avgSpeed'
  | 'maxSpeed'
  | 'heartRate'
  | 'power'
  | 'cadence'
  | 'hydration'
  | 'activities'
  | 'trainingLoad'

export type AchievementKind = 'distance_pr' | 'longest_ride' | 'fastest_ride' | 'elevation_record'

export interface AchievementInfo {
  kind: AchievementKind
  label: string
  value: string
  detail?: string
  segmentStartM?: number
  segmentEndM?: number
}

export interface ActivityShareContent {
  kind: 'activity'
  activity: Activity
  points: TrackPoint[]
  photos?: ActivityPhoto[]
  achievement?: AchievementInfo | null
}

export interface PeriodShareContent {
  kind: 'period'
  periodKind: 'week' | 'month' | 'year' | 'custom'
  title: string
  dateLabel: string
  statistics: StatisticsOverview
  summary?: string | null
}

export type ShareContent = ActivityShareContent | PeriodShareContent

export interface OverlayConfig {
  templateId: OverlayTemplateId
  formatId: OverlayFormatId
  theme: OverlayTheme
  background: OverlayBackground
  solidColor: string
  photoId: string | null
  photoPosition: number
  metrics: MetricKey[]
  showRoute: boolean
  showTitle: boolean
  showDate: boolean
  showWeather: boolean
  showBrand: boolean
}

export interface FormatSpec {
  id: OverlayFormatId
  label: string
  exportWidth: number
  exportHeight: number
  width: number
  height: number
}

export const FORMAT_SPECS: Record<OverlayFormatId, FormatSpec> = {
  square: { id: 'square', label: '1:1', exportWidth: 1080, exportHeight: 1080, width: 540, height: 540 },
  portrait: { id: 'portrait', label: '4:5', exportWidth: 1080, exportHeight: 1350, width: 540, height: 675 },
  story: { id: 'story', label: '9:16', exportWidth: 1080, exportHeight: 1920, width: 540, height: 960 },
  landscape: { id: 'landscape', label: '16:9', exportWidth: 1920, exportHeight: 1080, width: 960, height: 540 },
}

export const DEFAULT_CONFIG: OverlayConfig = {
  templateId: 'classic',
  formatId: 'portrait',
  theme: 'dark',
  background: 'solid',
  solidColor: '#080A0D',
  photoId: null,
  photoPosition: 50,
  metrics: ['distance', 'movingTime', 'avgSpeed', 'elevation'],
  showRoute: true,
  showTitle: true,
  showDate: true,
  showWeather: true,
  showBrand: true,
}
