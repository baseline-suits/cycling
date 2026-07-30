import { useState } from 'react'
import AirRoundedIcon from '@mui/icons-material/AirRounded'
import AutoGraphRoundedIcon from '@mui/icons-material/AutoGraphRounded'
import BedtimeRoundedIcon from '@mui/icons-material/BedtimeRounded'
import CalendarMonthRoundedIcon from '@mui/icons-material/CalendarMonthRounded'
import FavoriteRoundedIcon from '@mui/icons-material/FavoriteRounded'
import InsightsRoundedIcon from '@mui/icons-material/InsightsRounded'
import RouteRoundedIcon from '@mui/icons-material/RouteRounded'
import SpeedRoundedIcon from '@mui/icons-material/SpeedRounded'
import WaterDropRoundedIcon from '@mui/icons-material/WaterDropRounded'
import ShareRoundedIcon from '@mui/icons-material/ShareRounded'
import { Alert, alpha, Box, Button, Card, CardContent, Chip, MenuItem, Skeleton, Stack, TextField, Typography, useTheme } from '@mui/material'
import { useQuery } from '@tanstack/react-query'
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { insightsApi, statisticsApi, type InsightPattern } from '../api'
import { AIDataBasisPanel } from '../components/AIDataBasisPanel'
import { MarkdownText } from '../components/MarkdownText'
import { MetricCard } from '../components/MetricCard'
import { PageHeader } from '../components/PageHeader'
import { EmptyState, ErrorState } from '../components/States'
import { formatChartValue, formatDistance, formatDuration, formatHydration, formatSpeedMps } from '../utils/format'
import { ShareStudioDialog } from '../share/ShareStudioDialog'

const currentYear = new Date().getFullYear()
const seasons = [
  { value: 'year', label: 'Ganzes Jahr' },
  { value: 'spring', label: 'Frühling' },
  { value: 'summer', label: 'Sommer' },
  { value: 'autumn', label: 'Herbst' },
  { value: 'winter', label: 'Winter' },
]

function dateInput(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
}

function rangeForYears(years: number) {
  return { from: `${currentYear - years + 1}-01-01`, to: dateInput(new Date()) }
}

function numberValue(source: Record<string, unknown> | undefined, key: string) {
  const value = source?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function monthLabel(value: string) {
  return new Intl.DateTimeFormat('de-DE', { month: 'short', year: '2-digit' }).format(new Date(`${value}T12:00:00`))
}

function fitnessStatusLabel(status: string) {
  return ({
    insufficient_data: 'Noch zu wenig Daten',
    positive: 'Positiver Trend',
    negative: 'Unter Vergleichsniveau',
    stable: 'Stabiler Trend',
  } as Record<string, string>)[status] ?? status
}

export function DevelopmentPage() {
  const theme = useTheme()
  const [years, setYears] = useState(3)
  const [reviewYear, setReviewYear] = useState(currentYear)
  const [season, setSeason] = useState('year')
  const [shareOpen, setShareOpen] = useState(false)
  const range = rangeForYears(years)
  const insights = useQuery({
    queryKey: ['statistics', 'insights', range.from, range.to],
    queryFn: () => insightsApi.longTerm(range.from, range.to),
  })
  const review = useQuery({
    queryKey: ['statistics', 'review', reviewYear, season],
    queryFn: () => insightsApi.periodReview(reviewYear, season),
  })
  const reviewStatistics = useQuery({
    queryKey: ['statistics', 'overview', review.data?.period.date_from, review.data?.period.date_to, 'review-share'],
    queryFn: () => statisticsApi.overview(review.data!.period.date_from, review.data!.period.date_to, 'auto'),
    enabled: Boolean(review.data),
  })
  const monthly = (insights.data?.monthly ?? []).map((point) => ({
    ...point,
    label: monthLabel(point.period_start),
    distanceKm: Number((point.distance_m / 1000).toFixed(1)),
    speedKmh: point.avg_speed_mps == null ? null : Number((point.avg_speed_mps * 3.6).toFixed(1)),
  }))
  const current = insights.data?.current
  const hasActivities = (numberValue(current, 'activity_count') ?? 0) > 0
  const hydrationWasRecorded = (numberValue(current, 'hydration_activity_count') ?? 0) > 0
  const tooltipStyle = { borderRadius: 14, border: `1px solid ${theme.palette.divider}`, boxShadow: '0 12px 30px rgba(20,50,45,.08)' }

  return (
    <>
      <PageHeader
        eyebrow="LANGZEITANALYSE"
        title="Fitness & Entwicklung"
        description="Erkenne nachhaltige Trends und Zusammenhänge zwischen Wetter, Puls, Tempo, Erholung und Trainingsumfang."
      />

      <Card sx={{ mb: 3 }}>
        <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ xs: 'stretch', sm: 'center' }} gap={1.5}>
            <Box sx={{ mr: { sm: 'auto' } }}>
              <Typography variant="h4">Analysezeitraum</Typography>
              <Typography variant="body2" color="text.secondary">Monatliche und jährliche Entwicklung mit passender Vorperiode</Typography>
            </Box>
            <Stack direction="row" gap={1} flexWrap="wrap">
              {[1, 3, 5].map((value) => <Button key={value} variant={years === value ? 'contained' : 'outlined'} color={years === value ? 'primary' : 'inherit'} onClick={() => setYears(value)}>{value === 1 ? '1 Jahr' : `${value} Jahre`}</Button>)}
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      {insights.isError && <ErrorState error={insights.error} onRetry={() => void insights.refetch()} />}
      {insights.isLoading && <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', lg: 'repeat(4, 1fr)' }, gap: 2 }}>{Array.from({ length: 8 }).map((_, index) => <Skeleton key={index} variant="rounded" height={index < 4 ? 145 : 300} />)}</Box>}
      {insights.data && (
        <>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', lg: 'repeat(4, 1fr)' }, gap: 2, mb: 3 }}>
            <MetricCard label="Distanz" value={formatDistance(numberValue(current, 'distance_m'))} icon={<RouteRoundedIcon />} accent={theme.palette.chart.blue} delta={insights.data.changes.distance_m} hint="gegen Vorperiode" />
            <MetricCard label="Bewegungszeit" value={formatDuration(numberValue(current, 'moving_time_s'))} icon={<CalendarMonthRoundedIcon />} accent={theme.palette.chart.teal} delta={insights.data.changes.moving_time_s} hint="gegen Vorperiode" />
            <MetricCard label="Ø Geschwindigkeit" value={formatSpeedMps(numberValue(current, 'avg_speed_mps'))} icon={<SpeedRoundedIcon />} accent={theme.palette.chart.amber} delta={insights.data.changes.avg_speed_mps} hint="gegen Vorperiode" />
            <MetricCard label="Dokumentierte Trinkmenge" value={formatHydration(hydrationWasRecorded ? numberValue(current, 'hydration_ml') : null)} icon={<WaterDropRoundedIcon />} accent={theme.palette.chart.blue} delta={insights.data.changes.hydration_ml} hint="erfasste Aktivitäten" />
          </Box>

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: 'minmax(0, 1.55fr) minmax(320px, .75fr)' }, gap: 2.5, mb: 3 }}>
            <Card>
              <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
                <Typography variant="h3">Fitnessverlauf</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Trainingsumfang, Tempo und Belastung pro Monat</Typography>
                {hasActivities && monthly.length ? (
                  <ResponsiveContainer width="100%" height={330}>
                    <ComposedChart data={monthly} margin={{ top: 10, right: 5, left: -12, bottom: 0 }}>
                      <CartesianGrid vertical={false} strokeDasharray="4 4" stroke={theme.palette.divider} />
                      <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
                      <YAxis yAxisId="distance" width={48} axisLine={false} tickLine={false} tick={{ fontSize: 11 }} label={{ value: 'km', angle: -90, position: 'insideLeft', fontSize: 11 }} />
                      <YAxis yAxisId="speed" orientation="right" width={48} axisLine={false} tickLine={false} tick={{ fontSize: 11 }} label={{ value: 'km/h', angle: 90, position: 'insideRight', fontSize: 11 }} />
                      <Tooltip contentStyle={tooltipStyle} formatter={(value) => formatChartValue(value, 1)} />
                      <Legend />
                      <Bar yAxisId="distance" dataKey="distanceKm" name="Distanz (km)" fill={theme.palette.chart.blue} radius={[6, 6, 0, 0]} />
                      <Line yAxisId="speed" type="monotone" dataKey="speedKmh" name="Ø Geschwindigkeit" stroke={theme.palette.chart.teal} strokeWidth={3} dot={false} connectNulls />
                    </ComposedChart>
                  </ResponsiveContainer>
                ) : <EmptyState title="Noch kein Verlauf" description="Für diesen Zeitraum liegen noch keine monatlichen Aggregate vor." />}
              </CardContent>
            </Card>

            <Card sx={{ background: `linear-gradient(145deg, ${alpha(theme.palette.primary.main, .13)}, ${theme.palette.background.paper} 70%)` }}>
              <CardContent sx={{ p: 2.5 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={1}>
                  <Box><Typography variant="overline" color="primary.main" fontWeight={800}>FITNESSTREND</Typography><Typography variant="h3" sx={{ mt: .25 }}>{fitnessStatusLabel(insights.data.fitness_trend.status)}</Typography></Box>
                  <AutoGraphRoundedIcon color="primary" sx={{ fontSize: 34 }} />
                </Stack>
                <Typography sx={{ mt: 2, lineHeight: 1.7 }}>{insights.data.fitness_trend.statement}</Typography>
                <Stack direction="row" gap={.75} flexWrap="wrap" sx={{ mt: 2 }}>
                  <Chip size="small" label={`Konfidenz: ${insights.data.fitness_trend.confidence}`} />
                  <Chip size="small" variant="outlined" label={`${insights.data.fitness_trend.sample_size} Aktivitäten`} />
                  {insights.data.fitness_trend.speed_change_percent != null && <Chip size="small" variant="outlined" label={`Tempo ${insights.data.fitness_trend.speed_change_percent >= 0 ? '+' : ''}${insights.data.fitness_trend.speed_change_percent.toLocaleString('de-DE', { maximumFractionDigits: 1 })} %`} />}
                  {insights.data.fitness_trend.heart_rate_efficiency_change_percent != null && <Chip size="small" variant="outlined" label={`Puls-Effizienz ${insights.data.fitness_trend.heart_rate_efficiency_change_percent >= 0 ? '+' : ''}${insights.data.fitness_trend.heart_rate_efficiency_change_percent.toLocaleString('de-DE', { maximumFractionDigits: 1 })} %`} />}
                </Stack>
              </CardContent>
            </Card>
          </Box>

          <Stack direction="row" alignItems="center" gap={1} sx={{ mb: 1.5 }}><InsightsRoundedIcon color="primary" /><Box><Typography variant="h3">Erkannte Muster</Typography><Typography variant="body2" color="text.secondary">Beobachtungen mit Stichprobe, Konfidenz und Methode</Typography></Box></Stack>
          {insights.data.patterns.length ? (
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' }, gap: 2, mb: 3 }}>
              {insights.data.patterns.map((pattern, index) => <PatternCard key={`${pattern.kind}-${index}`} pattern={pattern} />)}
            </Box>
          ) : <Card sx={{ mb: 3 }}><EmptyState title="Noch keine belastbaren Muster" description="Mit mehr Aktivitäten kann Baseline Cycling Wetter, Puls, Tempo und Erholungsabstände verlässlicher vergleichen." /></Card>}

          <Alert severity="info" sx={{ mb: 3 }}>{insights.data.disclaimer}</Alert>
        </>
      )}

      <Card>
        <CardContent sx={{ p: { xs: 2, md: 3 } }}>
          <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'center' }} gap={2} sx={{ mb: 2.5 }}>
            <Box><Typography variant="h3">Saison- & Jahresrückblick</Typography><Typography variant="body2" color="text.secondary">Zusammenfassung mit offengelegter Datengrundlage</Typography></Box>
            <Stack direction={{ xs: 'column', sm: 'row' }} gap={1}>
              <TextField select label="Jahr" value={reviewYear} onChange={(event) => setReviewYear(Number(event.target.value))} sx={{ minWidth: 120 }}>{Array.from({ length: 10 }, (_, index) => currentYear - index).map((year) => <MenuItem key={year} value={year}>{year}</MenuItem>)}</TextField>
              <TextField select label="Zeitraum" value={season} onChange={(event) => setSeason(event.target.value)} sx={{ minWidth: 160 }}>{seasons.map((item) => <MenuItem key={item.value} value={item.value}>{item.label}</MenuItem>)}</TextField>
              <Button variant="contained" startIcon={<ShareRoundedIcon />} disabled={!review.data || !reviewStatistics.data || reviewStatistics.data.activity_count === 0} onClick={() => setShareOpen(true)}>Teilen</Button>
            </Stack>
          </Stack>
          {review.isLoading && <Skeleton variant="rounded" height={230} />}
          {review.isError && <ErrorState error={review.error} onRetry={() => void review.refetch()} />}
          {review.data && (
            <Stack spacing={2}>
              <Box sx={{ p: { xs: 2, sm: 2.5 }, borderRadius: 3.5, bgcolor: 'action.hover' }}>
                <Stack direction="row" gap={1} alignItems="center" sx={{ mb: 1 }}><CalendarMonthRoundedIcon color="primary" /><Typography fontWeight={800}>{seasons.find((item) => item.value === season)?.label} {review.data.year}</Typography><Chip size="small" variant="outlined" label={review.data.provider} /></Stack>
                <MarkdownText content={review.data.summary} />
              </Box>
              <AIDataBasisPanel dataBasis={review.data.data_basis} provider={review.data.provider} title="Datengrundlage des Rückblicks" />
            </Stack>
          )}
        </CardContent>
      </Card>
      {review.data && reviewStatistics.data && <ShareStudioDialog open={shareOpen} onClose={() => setShareOpen(false)} content={{ kind: 'period', periodKind: season === 'year' ? 'year' : 'custom', title: season === 'year' ? `Mein Radjahr ${review.data.year}` : `${seasons.find((item) => item.value === season)?.label} ${review.data.year}`, dateLabel: `${review.data.period.date_from} – ${review.data.period.date_to}`, statistics: reviewStatistics.data, summary: review.data.summary }} />}
    </>
  )
}

function patternPresentation(kind: string) {
  const normalized = kind.toLowerCase()
  if (normalized.includes('weather') || normalized.includes('wind') || normalized.includes('temperature')) return { label: 'Wetter', icon: <AirRoundedIcon />, color: '#4D82BC' }
  if (normalized.includes('heart') || normalized.includes('pulse') || normalized.includes('efficiency')) return { label: 'Puls', icon: <FavoriteRoundedIcon />, color: '#E26D5A' }
  if (normalized.includes('recover') || normalized.includes('rest')) return { label: 'Erholung', icon: <BedtimeRoundedIcon />, color: '#637C16' }
  return { label: 'Tempo', icon: <SpeedRoundedIcon />, color: '#E9A23B' }
}

function PatternCard({ pattern }: { pattern: InsightPattern }) {
  const presentation = patternPresentation(pattern.kind)
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent sx={{ p: 2.5 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={1}>
          <Stack direction="row" alignItems="center" gap={1}>
            <Box sx={{ width: 42, height: 42, borderRadius: 3, display: 'grid', placeItems: 'center', bgcolor: alpha(presentation.color, .12), color: presentation.color }}>{presentation.icon}</Box>
            <Box><Typography variant="h4">{presentation.label}</Typography><Typography variant="caption" color="text.secondary">{pattern.kind}</Typography></Box>
          </Stack>
          <Chip size="small" label={pattern.confidence} />
        </Stack>
        <Typography sx={{ mt: 1.75, lineHeight: 1.7 }}>{pattern.statement}</Typography>
        {Object.keys(pattern.evidence).length > 0 && <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: .75, mt: 1.5 }}>{Object.entries(pattern.evidence).slice(0, 6).map(([key, value]) => <Box key={key} sx={{ p: 1, borderRadius: 2, bgcolor: 'action.hover' }}><Typography variant="caption" color="text.secondary" sx={{ textTransform: 'capitalize' }}>{key.replaceAll('_', ' ')}</Typography><Typography variant="body2" fontWeight={750}>{typeof value === 'number' ? value.toLocaleString('de-DE', { maximumFractionDigits: 2 }) : String(value)}</Typography></Box>)}</Box>}
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1.5 }}>{pattern.sample_size} Aktivitäten · {pattern.method}</Typography>
      </CardContent>
    </Card>
  )
}
