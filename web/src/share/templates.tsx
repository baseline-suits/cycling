import type { ReactNode } from 'react'
import EmojiEventsRoundedIcon from '@mui/icons-material/EmojiEventsRounded'
import { Box, Stack, Typography } from '@mui/material'
import type { OverlayMetricValue } from './content'
import type { OverlayPalette } from './design'
import { RouteArtwork } from './RouteArtwork'
import type { OverlayConfig, OverlayTemplateId, ShareContent } from './types'

export interface TemplateProps {
  content: ShareContent
  config: OverlayConfig
  palette: OverlayPalette
  metrics: OverlayMetricValue[]
  title: string
  date: string
  weather: string | null
  landscape: boolean
}

export interface OverlayTemplateDefinition {
  id: OverlayTemplateId
  name: string
  description: string
  defaultBackground: OverlayConfig['background']
  defaultMetrics: OverlayConfig['metrics']
  render: (props: TemplateProps) => ReactNode
}

function Brand({ palette }: { palette: OverlayPalette }) {
  return <Typography fontSize={18} fontWeight={800} letterSpacing="-.04em" color={palette.text}>Baseline Cycling</Typography>
}

function Meta({ date, weather, palette }: Pick<TemplateProps, 'date' | 'weather' | 'palette'>) {
  return <Typography fontSize={11} fontWeight={750} color={palette.muted}>{date}{weather ? ` · ${weather}` : ''}</Typography>
}

function Title({ value, palette, size = 30 }: { value: string; palette: OverlayPalette; size?: number }) {
  return <Typography sx={{ fontSize: size, fontWeight: 850, lineHeight: 1.08, letterSpacing: '-.045em', color: palette.text, overflowWrap: 'anywhere', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{value}</Typography>
}

function Metric({ metric, palette, large = false }: { metric: OverlayMetricValue; palette: OverlayPalette; large?: boolean }) {
  return <Box sx={{ minWidth: 0 }}><Typography fontSize={large ? 12 : 9.5} fontWeight={800} color={palette.muted} textTransform="uppercase" letterSpacing=".075em" noWrap>{metric.label}</Typography><Typography fontSize={large ? 28 : 18} fontWeight={850} lineHeight={1.15} letterSpacing="-.035em" color={metric.key === 'heartRate' ? palette.achievement : palette.text} noWrap>{metric.value}</Typography></Box>
}

function MetricGrid({ metrics, palette, columns = 3, large = false }: { metrics: OverlayMetricValue[]; palette: OverlayPalette; columns?: number; large?: boolean }) {
  return <Box sx={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(columns, Math.max(metrics.length, 1))}, minmax(0, 1fr))`, columnGap: 2, rowGap: 2 }}>{metrics.map((metric) => <Metric key={metric.key} metric={metric} palette={palette} large={large} />)}</Box>
}

function Topline(props: TemplateProps) {
  return <Stack direction="row" justifyContent="space-between" alignItems="center">{props.config.showBrand ? <Brand palette={props.palette} /> : <span />}{props.config.showDate && <Meta date={props.date} weather={props.config.showWeather ? props.weather : null} palette={props.palette} />}</Stack>
}

function route(content: ShareContent) {
  return content.kind === 'activity' ? content.points : []
}

function Classic(props: TemplateProps) {
  const { palette, config, metrics, content, landscape } = props
  return <Stack sx={{ height: '100%', p: landscape ? 3.5 : 4, gap: 2.2 }}>
    <Topline {...props} />
    <Box sx={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: landscape ? '1.28fr .72fr' : '1fr', gap: 2 }}>
      <Box sx={{ position: 'relative', overflow: 'hidden', borderRadius: '26px', bgcolor: palette.surface, boxShadow: palette.shadow, p: config.showRoute ? 2.5 : 0 }}>
        {config.showRoute && <RouteArtwork points={route(content)} color={palette.accent} halo={palette.routeHalo} accent={palette.achievement} achievement={content.kind === 'activity' ? content.achievement : null} />}
      </Box>
      {landscape && <Stack justifyContent="flex-end" gap={2.2}>{config.showTitle && <Title value={props.title} palette={palette} size={34} />}<MetricGrid metrics={metrics} palette={palette} columns={2} /></Stack>}
    </Box>
    {!landscape && config.showTitle && <Title value={props.title} palette={palette} />}
    {!landscape && <Box sx={{ borderTop: `1px solid ${palette.muted}55`, pt: 2 }}><MetricGrid metrics={metrics} palette={palette} columns={3} /></Box>}
  </Stack>
}

function Minimal(props: TemplateProps) {
  const { palette, config, metrics, content } = props
  return <Box sx={{ height: '100%', position: 'relative', p: 4 }}>
    {config.showRoute && content.kind === 'activity' && <Box sx={{ position: 'absolute', inset: '7% 5% 35%', opacity: .84 }}><RouteArtwork points={content.points} color={palette.text} halo="transparent" accent={palette.accent} achievement={content.achievement} label={false} /></Box>}
    <Stack sx={{ position: 'absolute', left: 32, right: 32, bottom: 30 }} gap={1.6}>
      <Topline {...props} />
      {config.showTitle && <Title value={props.title} palette={palette} size={27} />}
      <Stack direction="row" gap={3} flexWrap="wrap">{metrics.slice(0, 4).map((metric) => <Metric key={metric.key} metric={metric} palette={palette} />)}</Stack>
    </Stack>
  </Box>
}

function Photo(props: TemplateProps) {
  const { palette, config, metrics } = props
  return <Stack justifyContent="flex-end" sx={{ height: '100%', p: 4, position: 'relative' }} gap={2}>
    <Box sx={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(3,16,15,.02) 20%, rgba(3,16,15,.28) 55%, rgba(3,16,15,.88) 100%)' }} />
    <Box sx={{ position: 'relative' }}><Topline {...props} /></Box>
    {config.showTitle && <Box sx={{ position: 'relative' }}><Title value={props.title} palette={{ ...palette, text: '#FFFFFF', muted: '#D8E3E0' }} size={34} /></Box>}
    <Box sx={{ position: 'relative', p: 2.2, borderRadius: '22px', bgcolor: 'rgba(5, 28, 26, .7)', border: '1px solid rgba(255,255,255,.14)' }}><MetricGrid metrics={metrics} palette={{ ...palette, text: '#FFFFFF', muted: '#C7D7D3' }} columns={3} /></Box>
  </Stack>
}

function Stats(props: TemplateProps) {
  const { palette, config, metrics, content, landscape } = props
  const hero = metrics[0]
  return <Stack sx={{ height: '100%', p: 4 }} gap={2.5}>
    <Topline {...props} />
    <Box sx={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: landscape ? '1.2fr .8fr' : '1fr', gap: 2.5, alignItems: 'stretch' }}>
      <Stack justifyContent="center" gap={1}>{hero && <><Typography fontSize={13} fontWeight={850} color={palette.accent} textTransform="uppercase" letterSpacing=".12em">{hero.label}</Typography><Typography fontSize={landscape ? 90 : 72} fontWeight={900} lineHeight={.95} letterSpacing="-.07em" color={palette.text}>{hero.value}</Typography></>}{config.showTitle && <Title value={props.title} palette={palette} size={24} />}</Stack>
      <Stack justifyContent="space-between" gap={2}>{config.showRoute && content.kind === 'activity' && <Box sx={{ flex: 1, minHeight: 130, p: 1.5, borderRadius: '22px', bgcolor: palette.surface }}><RouteArtwork points={content.points} color={palette.accent} halo={palette.routeHalo} accent={palette.achievement} achievement={content.achievement} label={false} /></Box>}<MetricGrid metrics={metrics.slice(1)} palette={palette} columns={landscape ? 2 : 3} /></Stack>
    </Box>
  </Stack>
}

function MapTemplate(props: TemplateProps) {
  const { palette, config, metrics } = props
  return <Stack justifyContent="space-between" sx={{ height: '100%', p: 3.2, position: 'relative' }}>
    <Box sx={{ p: 2, borderRadius: '20px', bgcolor: palette.surface, boxShadow: palette.shadow }}><Topline {...props} />{config.showTitle && <Box mt={1}><Title value={props.title} palette={palette} size={25} /></Box>}</Box>
    <Box sx={{ p: 2.2, borderRadius: '22px', bgcolor: palette.surface, boxShadow: palette.shadow }}><MetricGrid metrics={metrics.slice(0, 4)} palette={palette} columns={Math.min(4, metrics.length)} /></Box>
  </Stack>
}

function Achievement(props: TemplateProps) {
  const { palette, config, metrics, content, landscape } = props
  const achievement = content.kind === 'activity' ? content.achievement : null
  const hero = achievement?.value ?? metrics[0]?.value ?? 'Dein Moment'
  return <Box sx={{ height: '100%', p: 4, position: 'relative', overflow: 'hidden' }}>
    <Box sx={{ position: 'absolute', width: 330, height: 330, borderRadius: '50%', border: `54px solid ${palette.achievement}`, opacity: .12, right: -100, top: -100 }} />
    <Stack sx={{ height: '100%', position: 'relative' }} gap={2}>
      <Topline {...props} />
      <Stack direction="row" alignItems="center" gap={1} color={palette.achievement}><EmojiEventsRoundedIcon /><Typography fontSize={13} fontWeight={900} textTransform="uppercase" letterSpacing=".1em">{achievement?.label ?? 'Persönlicher Meilenstein'}</Typography></Stack>
      <Typography fontSize={landscape ? 74 : 66} fontWeight={900} lineHeight={.93} letterSpacing="-.065em" color={palette.text}>{hero}</Typography>
      {config.showTitle && <Title value={props.title} palette={palette} size={27} />}
      <Box sx={{ flex: 1, minHeight: 0, p: 1.5, borderRadius: '25px', bgcolor: palette.surface }}>
        {config.showRoute && content.kind === 'activity' ? <RouteArtwork points={content.points} color={palette.text} halo={palette.routeHalo} accent={palette.achievement} achievement={achievement} label={false} /> : <Stack justifyContent="center" sx={{ height: '100%' }}><MetricGrid metrics={metrics} palette={palette} columns={3} large /></Stack>}
      </Box>
      {config.showRoute && <MetricGrid metrics={metrics.slice(achievement ? 0 : 1, achievement ? 4 : 5)} palette={palette} columns={Math.min(4, metrics.length)} />}
    </Stack>
  </Box>
}

export const OVERLAY_TEMPLATES: OverlayTemplateDefinition[] = [
  { id: 'classic', name: 'Classic', description: 'Karte und Kennzahlen im Gleichgewicht', defaultBackground: 'solid', defaultMetrics: ['distance', 'movingTime', 'avgSpeed', 'elevation'], render: Classic },
  { id: 'minimal', name: 'Minimal', description: 'Reduziert und transparent', defaultBackground: 'transparent', defaultMetrics: ['distance', 'movingTime', 'avgSpeed'], render: Minimal },
  { id: 'photo', name: 'Photo', description: 'Erinnerung als vollflächiger Hintergrund', defaultBackground: 'photo', defaultMetrics: ['distance', 'movingTime', 'elevation'], render: Photo },
  { id: 'stats', name: 'Stats', description: 'Leistungswerte groß inszeniert', defaultBackground: 'solid', defaultMetrics: ['distance', 'movingTime', 'avgSpeed', 'elevation', 'heartRate'], render: Stats },
  { id: 'map', name: 'Map', description: 'Die Strecke steht im Mittelpunkt', defaultBackground: 'map', defaultMetrics: ['distance', 'movingTime', 'elevation'], render: MapTemplate },
  { id: 'achievement', name: 'Achievement', description: 'Rekorde und Meilensteine feiern', defaultBackground: 'solid', defaultMetrics: ['distance', 'movingTime', 'avgSpeed', 'elevation'], render: Achievement },
]

export function templateById(id: OverlayTemplateId) {
  return OVERLAY_TEMPLATES.find((template) => template.id === id) ?? OVERLAY_TEMPLATES[0]
}
