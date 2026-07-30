import { useMemo, useState } from 'react'
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded'
import DirectionsBikeRoundedIcon from '@mui/icons-material/DirectionsBikeRounded'
import RouteRoundedIcon from '@mui/icons-material/RouteRounded'
import {
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  LinearProgress,
  Skeleton,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material'
import { useQuery } from '@tanstack/react-query'
import { Link as RouterLink, useOutletContext } from 'react-router-dom'
import { activitiesApi, gamificationApi, insightsApi, statisticsApi, type StatisticsGranularity } from '../api'
import { useAuth } from '../auth/AuthContext'
import { EmptyState, ErrorState } from '../components/States'
import { TrackMap } from '../components/TrackMap'
import { TrendChart } from '../components/TrendChart'
import type { ShellOutletContext } from '../layout/AppShell'
import { currentWeekRange } from '../utils/dateRange'
import { formatDateTime, formatDistance, formatDuration, formatElevation, formatSpeedMps } from '../utils/format'

type Period = 'week' | 'month' | 'year'
const periodLabels: Record<Period, string> = { week: 'Woche', month: 'Monat', year: 'Jahr' }

function dateInput(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function periodRange(period: Period) {
  const today = new Date()
  const from = new Date(today)
  let granularity: StatisticsGranularity = 'day'
  if (period === 'week') return { ...currentWeekRange(today), granularity }
  if (period === 'month') from.setDate(today.getDate() - 29)
  if (period === 'year') {
    from.setFullYear(today.getFullYear() - 1)
    from.setDate(from.getDate() + 1)
    granularity = 'month'
  }
  return { from: dateInput(from), to: dateInput(today), granularity }
}

export function MinimalDashboardPage() {
  const { profile } = useAuth()
  const { openImport } = useOutletContext<ShellOutletContext>()
  const [period, setPeriod] = useState<Period>('month')
  const range = useMemo(() => periodRange(period), [period])
  const weekRange = useMemo(() => periodRange('week'), [])

  const trend = useQuery({ queryKey: ['statistics', 'overview', range.from, range.to, range.granularity], queryFn: () => statisticsApi.overview(range.from, range.to, range.granularity) })
  const week = useQuery({ queryKey: ['statistics', 'overview', weekRange.from, weekRange.to, 'day'], queryFn: () => statisticsApi.overview(weekRange.from, weekRange.to, 'day') })
  const recent = useQuery({ queryKey: ['activities', { limit: 6 }], queryFn: () => activitiesApi.list({ limit: 6 }) })
  const trendActivities = useQuery({ queryKey: ['activities', 'dashboard-trend', range.from, range.to], queryFn: () => activitiesApi.list({ date_from: range.from, date_to: range.to, limit: 200 }) })
  const insights = useQuery({ queryKey: ['statistics', 'insights', range.from, range.to], queryFn: () => insightsApi.longTerm(range.from, range.to) })
  const goals = useQuery({ queryKey: ['gamification', 'overview'], queryFn: gamificationApi.overview })
  const lastActivity = recent.data?.items[0]
  const lastTrack = useQuery({ queryKey: ['activity', lastActivity?.id, 'track'], queryFn: () => activitiesApi.track(lastActivity!.id), enabled: Boolean(lastActivity?.id) })

  const weeklyDistanceGoal = goals.data?.goals.find((goal) => goal.status === 'active' && goal.metric === 'distance_m' && goal.period === 'week')
  const weeklyTargetKm = weeklyDistanceGoal ? weeklyDistanceGoal.target_value / 1000 : null
  const weeklyDistanceKm = (week.data?.distance_m ?? 0) / 1000
  const weeklyProgress = weeklyTargetKm ? Math.min(100, weeklyDistanceKm / weeklyTargetKm * 100) : 0
  const distanceChange = trend.data?.comparison?.changes.distance_m
  const chartData = useMemo(() => {
    if (trend.data?.series?.length) return trend.data.series.map((point) => ({
      label: new Intl.DateTimeFormat('de-DE', period === 'year' ? { month: 'short' } : { day: '2-digit', month: '2-digit' }).format(new Date(`${point.period_start.slice(0, 10)}T12:00:00`)),
      distance_km: point.distance_m / 1000,
    }))
    const grouped = new Map<string, number>()
    for (const activity of trendActivities.data?.items ?? []) {
      const date = new Date(activity.started_at)
      const key = period === 'year' ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}` : dateInput(date)
      grouped.set(key, (grouped.get(key) ?? 0) + activity.distance_m / 1000)
    }
    return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, distance_km]) => ({
      label: new Intl.DateTimeFormat('de-DE', period === 'year' ? { month: 'short' } : { day: '2-digit', month: '2-digit' }).format(new Date(`${key}${key.length === 7 ? '-01' : ''}T12:00:00`)),
      distance_km,
    }))
  }, [period, trend.data?.series, trendActivities.data?.items])

  return (
    <Stack spacing={{ xs: 6, md: 8 }}>
      <Box component="header" sx={{ pt: { md: 2 }, maxWidth: 900 }}>
        <Typography variant="overline" color="primary.main">Dein Training</Typography>
        <Typography component="h1" variant="h1" sx={{ mt: 1 }}>Hallo, {profile?.display_name?.split(' ')[0] || 'du'}.</Typography>
        <Typography sx={{ mt: 2, maxWidth: 680, color: 'text.secondary', fontSize: { xs: '1.05rem', md: '1.2rem' } }}>
          {insights.data?.fitness_trend.statement || 'Deine Fahrten erzählen mit der Zeit eine persönliche Geschichte über Ausdauer, Rhythmus und Fortschritt.'}
        </Typography>
      </Box>

      <Box component="section" aria-labelledby="week-title" sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(0, .9fr) minmax(280px, .55fr)' }, gap: { xs: 4, md: 7 }, alignItems: 'end' }}>
        <Box>
          <Typography id="week-title" variant="h3">Diese Woche</Typography>
          {week.isLoading ? <Skeleton height={90} /> : (
            <>
              <Stack direction="row" alignItems="baseline" gap={1.25} flexWrap="wrap" sx={{ mt: 2 }}>
                <Typography sx={{ fontSize: 'clamp(3.2rem, 9vw, 6.4rem)', lineHeight: .95, letterSpacing: '-.07em', fontWeight: 670 }}>{weeklyDistanceKm.toLocaleString('de-DE', { maximumFractionDigits: 1 })}</Typography>
                <Typography color="text.secondary" sx={{ fontSize: '1.2rem' }}>{weeklyTargetKm ? `km von ${weeklyTargetKm.toLocaleString('de-DE', { maximumFractionDigits: 1 })} km` : 'km · kein Wochenziel'}</Typography>
              </Stack>
              <LinearProgress variant="determinate" value={weeklyProgress} aria-label="Wochenfortschritt" sx={{ height: 6, borderRadius: 999, mt: 3, maxWidth: 720 }} />
            </>
          )}
        </Box>
        <Box sx={{ borderLeft: { md: '1px solid' }, borderColor: 'divider', pl: { md: 4 } }}>
          <Typography color="text.secondary" variant="body2">Trainingsbelastung</Typography>
          <Typography variant="h2" sx={{ mt: .5 }}>{Math.round(week.data?.training_load ?? 0).toLocaleString('de-DE')}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>Ein ruhiger Orientierungswert aus deinen Fahrten dieser Woche.</Typography>
        </Box>
      </Box>

      <Card component="section" aria-labelledby="trend-title" sx={{ bgcolor: 'var(--avento-minimal-surface-subtle)', overflow: 'hidden' }}>
        <CardContent sx={{ p: { xs: 2.5, sm: 4, md: 5 }, '&:last-child': { pb: { xs: 2.5, sm: 4, md: 5 } } }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={2.5} alignItems={{ xs: 'stretch', sm: 'flex-start' }}>
            <Box>
              <Typography id="trend-title" variant="h2">Deine Distanz entwickelt sich.</Typography>
              <Typography color="text.secondary" sx={{ mt: 1 }}>
                {formatDistance(trend.data?.distance_m)} im Zeitraum
                {distanceChange != null && ` · ${distanceChange >= 0 ? '+' : ''}${Math.round(distanceChange)} % zur Vorperiode`}
              </Typography>
            </Box>
            <ToggleButtonGroup exclusive size="small" value={period} onChange={(_, value: Period | null) => value && setPeriod(value)} aria-label="Zeitraum wählen">
              {(Object.keys(periodLabels) as Period[]).map((key) => <ToggleButton key={key} value={key}>{periodLabels[key]}</ToggleButton>)}
            </ToggleButtonGroup>
          </Stack>
          <Box sx={{ mt: 4, mx: { xs: -1.5, sm: 0 }, minWidth: 0 }}>
            {trend.isError ? <ErrorState error={trend.error} onRetry={() => void trend.refetch()} /> : trend.isLoading || trendActivities.isLoading ? <Skeleton variant="rounded" height={310} /> : chartData.length ? <TrendChart data={chartData} /> : <EmptyState title="Noch kein Verlauf" description="Mit deiner ersten importierten Fahrt beginnt hier deine Entwicklung." action={<Button onClick={openImport}>Erste Fahrt importieren</Button>} />}
          </Box>
        </CardContent>
      </Card>

      <Box component="section" aria-labelledby="impulse-title" sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, .75fr) minmax(0, 1.25fr)' }, gap: { xs: 4, lg: 6 }, alignItems: 'stretch' }}>
        <Box sx={{ py: { lg: 3 } }}>
          <Stack direction="row" gap={1} alignItems="center" color="primary.main"><AutoAwesomeRoundedIcon fontSize="small" /><Typography variant="overline">Trainingsimpuls</Typography></Stack>
          <Typography id="impulse-title" variant="h2" sx={{ mt: 2 }}>Bleib bei deinem Rhythmus.</Typography>
          <Typography color="text.secondary" sx={{ mt: 2, lineHeight: 1.8 }}>{insights.data?.fitness_trend.statement || 'Regelmäßige, gut verteilte Fahrten sind oft wertvoller als einzelne besonders intensive Tage.'}</Typography>
        </Box>

        <Card sx={{ bgcolor: 'var(--avento-minimal-surface-raised)', overflow: 'hidden' }}>
          {lastActivity ? (
            <CardActionArea component={RouterLink} to={`/aktivitaeten/${lastActivity.id}`} sx={{ height: '100%', alignItems: 'stretch' }}>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'minmax(0, 1fr) minmax(240px, .9fr)' }, minHeight: 330 }}>
                <Box sx={{ p: { xs: 3, md: 4 }, display: 'flex', flexDirection: 'column' }}>
                  <Typography variant="overline" color="primary.main">Deine letzte Fahrt</Typography>
                  <Typography variant="h2" sx={{ mt: 1.5 }}>{lastActivity.title}</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>{formatDateTime(lastActivity.started_at)}</Typography>
                  <Box sx={{ flex: 1 }} />
                  <Typography sx={{ mt: 4, fontSize: 'clamp(2.4rem, 6vw, 4.2rem)', lineHeight: 1, fontWeight: 670, letterSpacing: '-.055em' }}>{formatDistance(lastActivity.distance_m)}</Typography>
                  <Stack direction="row" gap={2.5} flexWrap="wrap" sx={{ mt: 2 }}>
                    <Typography variant="body2" color="text.secondary">{formatDuration(lastActivity.moving_time_s)}</Typography>
                    <Typography variant="body2" color="text.secondary">{formatSpeedMps(lastActivity.avg_speed_mps)}</Typography>
                    <Typography variant="body2" color="text.secondary">{formatElevation(lastActivity.elevation_gain_m)}</Typography>
                  </Stack>
                </Box>
                <Box sx={{ minHeight: { xs: 260, sm: 330 }, bgcolor: '#DDE6E2', '& .maplibregl-map': { minHeight: '100%' } }}>
                  {lastTrack.isLoading ? <Skeleton variant="rectangular" height="100%" /> : lastTrack.data?.points?.length ? <TrackMap points={lastTrack.data.points} height={330} variant="minimal" /> : <Stack height="100%" minHeight={260} alignItems="center" justifyContent="center" color="text.secondary"><RouteRoundedIcon /><Typography variant="body2" sx={{ mt: 1 }}>Keine Routenvorschau verfügbar</Typography></Stack>}
                </Box>
              </Box>
            </CardActionArea>
          ) : (
            <Stack minHeight={330} alignItems="center" justifyContent="center" textAlign="center" sx={{ p: 4 }}><DirectionsBikeRoundedIcon color="primary" /><Typography variant="h3" sx={{ mt: 2 }}>Deine erste Erinnerung wartet.</Typography><Button variant="contained" onClick={openImport} sx={{ mt: 2 }}>Fahrt importieren</Button></Stack>
          )}
        </Card>
      </Box>

      <Box component="section" aria-label="Ergänzende Statistiken" sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' }, columnGap: { xs: 2, md: 5 }, rowGap: 4, pt: 1 }}>
        {[
          ['Fahrten', String(trend.data?.activity_count ?? 0)],
          ['Distanz', formatDistance(trend.data?.distance_m)],
          ['Höhenmeter', formatElevation(trend.data?.elevation_gain_m)],
          ['Ø Geschwindigkeit', formatSpeedMps(trend.data?.avg_speed_mps)],
        ].map(([label, value]) => <Box key={label} sx={{ minWidth: 0 }}><Typography variant="body2" color="text.secondary">{label}</Typography><Typography variant="h3" sx={{ mt: .75, overflowWrap: 'anywhere' }}>{value}</Typography></Box>)}
      </Box>
    </Stack>
  )
}
