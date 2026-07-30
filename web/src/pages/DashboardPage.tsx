import { useMemo, useState } from 'react'
import AccessTimeRoundedIcon from '@mui/icons-material/AccessTimeRounded'
import AddRoundedIcon from '@mui/icons-material/AddRounded'
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded'
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded'
import DirectionsBikeRoundedIcon from '@mui/icons-material/DirectionsBikeRounded'
import EmojiEventsRoundedIcon from '@mui/icons-material/EmojiEventsRounded'
import FavoriteRoundedIcon from '@mui/icons-material/FavoriteRounded'
import LandscapeRoundedIcon from '@mui/icons-material/LandscapeRounded'
import RouteRoundedIcon from '@mui/icons-material/RouteRounded'
import SpeedRoundedIcon from '@mui/icons-material/SpeedRounded'
import ThermostatRoundedIcon from '@mui/icons-material/ThermostatRounded'
import TrendingUpRoundedIcon from '@mui/icons-material/TrendingUpRounded'
import {
  alpha,
  Avatar,
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  CircularProgress,
  LinearProgress,
  Skeleton,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  useTheme,
} from '@mui/material'
import { useQuery } from '@tanstack/react-query'
import { Link as RouterLink, useNavigate, useOutletContext } from 'react-router-dom'
import { activitiesApi, gamificationApi, insightsApi, statisticsApi, type Activity, type StatisticsGranularity } from '../api'
import { useAuth } from '../auth/AuthContext'
import { GamificationOverviewCard } from '../components/gamification/GamificationOverviewCard'
import { EmptyState, ErrorState } from '../components/States'
import { MetricCard } from '../components/MetricCard'
import { TrendChart } from '../components/TrendChart'
import type { ShellOutletContext } from '../layout/AppShell'
import { currentWeekRange } from '../utils/dateRange'
import { formatDateTime, formatDistance, formatDuration, formatElevation, formatHeartRate, formatSpeedMps } from '../utils/format'

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

function percent(value?: number | null) {
  return value == null ? null : Number(value.toFixed(0))
}

export function DashboardPage() {
  const { profile } = useAuth()
  const { openImport } = useOutletContext<ShellOutletContext>()
  const theme = useTheme()
  const [period, setPeriod] = useState<Period>('month')
  const range = useMemo(() => periodRange(period), [period])
  const year = new Date().getFullYear()
  const today = dateInput(new Date())
  const yearFrom = `${year}-01-01`
  const weekRange = periodRange('week')

  const annual = useQuery({
    queryKey: ['statistics', 'overview', yearFrom, today, 'month'],
    queryFn: () => statisticsApi.overview(yearFrom, today, 'month'),
  })
  const trend = useQuery({
    queryKey: ['statistics', 'overview', range.from, range.to, range.granularity],
    queryFn: () => statisticsApi.overview(range.from, range.to, range.granularity),
  })
  const week = useQuery({
    queryKey: ['statistics', 'overview', weekRange.from, weekRange.to, 'day'],
    queryFn: () => statisticsApi.overview(weekRange.from, weekRange.to, 'day'),
  })
  const recent = useQuery({
    queryKey: ['activities', { limit: 6 }],
    queryFn: () => activitiesApi.list({ limit: 6 }),
  })
  const trendActivities = useQuery({
    queryKey: ['activities', 'dashboard-trend', range.from, range.to],
    queryFn: () => activitiesApi.list({ date_from: range.from, date_to: range.to, limit: 200 }),
  })
  const records = useQuery({ queryKey: ['statistics', 'records'], queryFn: insightsApi.records })
  const insights = useQuery({
    queryKey: ['statistics', 'insights', range.from, range.to],
    queryFn: () => insightsApi.longTerm(range.from, range.to),
  })
  const goals = useQuery({ queryKey: ['gamification', 'overview'], queryFn: gamificationApi.overview })

  const comparison = trend.data?.comparison
  const change = (key: string) => percent(comparison?.changes[key])
  const activities = recent.data?.items ?? []
  const weeklyDistanceGoal = goals.data?.goals.find((goal) => goal.status === 'active' && goal.metric === 'distance_m' && goal.period === 'week')
  const weeklyTargetKm = weeklyDistanceGoal ? weeklyDistanceGoal.target_value / 1000 : null
  const weeklyDistanceKm = (week.data?.distance_m ?? 0) / 1000
  const weeklyProgress = weeklyTargetKm ? Math.min(100, (weeklyDistanceKm / weeklyTargetKm) * 100) : 0
  const weatherActivity = activities.find((activity) => activity.weather?.temperature_c != null || activity.weather?.condition)
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
    <Stack spacing={{ xs: 2, md: 2.5 }}>
      <Hero
        name={profile?.display_name?.split(' ')[0] ?? ''}
        year={year}
        loading={annual.isLoading}
        values={{
          rides: annual.data?.activity_count ?? 0,
          distance: formatDistance(annual.data?.distance_m),
          elevation: formatElevation(annual.data?.elevation_gain_m),
          duration: formatDuration(annual.data?.moving_time_s),
          speed: formatSpeedMps(annual.data?.avg_speed_mps),
        }}
        onImport={openImport}
      />

      {trend.isError ? <ErrorState error={trend.error} onRetry={() => void trend.refetch()} /> : (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', lg: 'repeat(4, 1fr)' }, gap: { xs: 1.25, md: 2 } }}>
          {trend.isLoading ? Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} variant="rounded" height={154} />) : (
            <>
              <MetricCard label="Fahrten" value={String(trend.data?.activity_count ?? 0)} icon={<DirectionsBikeRoundedIcon />} accent={theme.palette.chart.teal} delta={change('activity_count')} hint="zur Vorperiode" />
              <MetricCard label="Distanz" value={formatDistance(trend.data?.distance_m)} icon={<RouteRoundedIcon />} accent={theme.palette.chart.blue} delta={change('distance_m')} hint="zur Vorperiode" />
              <MetricCard label="Höhenmeter" value={formatElevation(trend.data?.elevation_gain_m)} icon={<LandscapeRoundedIcon />} accent={theme.palette.chart.coral} delta={change('elevation_gain_m')} hint="zur Vorperiode" />
              <MetricCard label="Ø Geschwindigkeit" value={formatSpeedMps(trend.data?.avg_speed_mps)} icon={<SpeedRoundedIcon />} accent={theme.palette.chart.lime} delta={change('avg_speed_mps')} hint="zur Vorperiode" />
            </>
          )}
        </Box>
      )}

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: 'minmax(0, 1.55fr) minmax(330px, .65fr)' }, gap: 2.5, alignItems: 'stretch' }}>
        <Card sx={{ minWidth: 0 }}>
          <CardContent sx={{ p: { xs: 2, sm: 3 }, '&:last-child': { pb: { xs: 2, sm: 3 } } }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={2} alignItems={{ xs: 'stretch', sm: 'flex-start' }}>
              <Box>
                <Typography variant="overline" color="primary.main" fontWeight={800}>LEISTUNGSVERLAUF</Typography>
                <Typography variant="h3">Distanz im Verlauf</Typography>
                <Stack direction="row" gap={1} alignItems="center" sx={{ mt: .5 }}>
                  <Typography variant="body2" color="text.secondary">{formatDistance(trend.data?.distance_m)} in diesem Zeitraum</Typography>
                  {change('distance_m') != null && <Chip size="small" color={change('distance_m')! >= 0 ? 'success' : 'default'} label={`${change('distance_m')! >= 0 ? '+' : ''}${change('distance_m')} %`} />}
                </Stack>
              </Box>
              <ToggleButtonGroup exclusive size="small" value={period} onChange={(_, value: Period | null) => value && setPeriod(value)} aria-label="Zeitraum wählen">
                {(Object.keys(periodLabels) as Period[]).map((key) => <ToggleButton key={key} value={key}>{periodLabels[key]}</ToggleButton>)}
              </ToggleButtonGroup>
            </Stack>
            <Box sx={{ mt: 2, mx: { xs: -1, sm: 0 } }}>
              {trend.isLoading || trendActivities.isLoading ? <Skeleton variant="rounded" height={310} /> : chartData.length ? <TrendChart data={chartData} /> : (
                <EmptyState title="Noch kein Verlauf" description="Mit deiner ersten importierten Fahrt entsteht hier dein Leistungsverlauf." action={<Button onClick={openImport}>Erste Fahrt importieren</Button>} />
              )}
            </Box>
          </CardContent>
        </Card>

        <Stack spacing={2.5}>
          <CoachCard statement={insights.data?.fitness_trend.statement} loading={insights.isLoading} />
          <WeekProgress distanceKm={weeklyDistanceKm} targetKm={weeklyTargetKm} progress={weeklyProgress} trainingLoad={week.data?.training_load ?? 0} loading={week.isLoading || goals.isLoading} goalTitle={weeklyDistanceGoal?.title} />
        </Stack>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)', xl: 'repeat(4, 1fr)' }, gap: 2 }}>
        <RecordCard records={records.data} fallback={activities.reduce<Activity | undefined>((best, activity) => !best || activity.distance_m > best.distance_m ? activity : best, undefined)} loading={records.isLoading} />
        <GamificationOverviewCard />
        <WeatherWidget activity={weatherActivity} />
      </Box>

      <Box>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-end" sx={{ mb: 1.5 }}>
          <Box><Typography variant="h3">Letzte Aktivitäten</Typography><Typography variant="body2" color="text.secondary">Die wichtigsten Werte deiner jüngsten Fahrten</Typography></Box>
          <Button component={RouterLink} to="/aktivitaeten" endIcon={<ArrowForwardRoundedIcon />}>Alle</Button>
        </Stack>
        {recent.isError && <ErrorState error={recent.error} onRetry={() => void recent.refetch()} />}
        {recent.isLoading && <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'repeat(2, 1fr)' }, gap: 2 }}>{Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} variant="rounded" height={182} />)}</Box>}
        {activities.length > 0 && <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>{activities.slice(0, 4).map((activity) => <DashboardActivityCard key={activity.id} activity={activity} />)}</Box>}
        {recent.data && !activities.length && <Card><EmptyState title="Noch keine Fahrt" description="Importiere eine TCX-Datei und starte deine persönliche Analyse." action={<Button variant="contained" onClick={openImport}>Importieren</Button>} /></Card>}
      </Box>
    </Stack>
  )
}

function Hero({ name, year, loading, values, onImport }: { name: string; year: number; loading: boolean; values: { rides: number; distance: string; elevation: string; duration: string; speed: string }; onImport: () => void }) {
  const theme = useTheme()
  const metrics = [
    { label: 'Fahrten', value: String(values.rides), icon: <DirectionsBikeRoundedIcon /> },
    { label: 'Kilometer', value: values.distance, icon: <RouteRoundedIcon /> },
    { label: 'Höhenmeter', value: values.elevation, icon: <LandscapeRoundedIcon /> },
    { label: 'Fahrzeit', value: values.duration, icon: <AccessTimeRoundedIcon /> },
    { label: 'Ø Tempo', value: values.speed, icon: <SpeedRoundedIcon /> },
  ]
  return (
    <Card sx={{ overflow: 'hidden', background: `radial-gradient(circle at 92% 10%, ${alpha(theme.palette.primary.main, .2)}, transparent 34%), linear-gradient(135deg, ${alpha(theme.palette.primary.main, .1)}, ${theme.palette.background.paper} 60%)` }}>
      <CardContent sx={{ p: { xs: 2.5, sm: 3.5 }, '&:last-child': { pb: { xs: 2.5, sm: 3.5 } } }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'flex-start' }} gap={2}>
          <Box><Typography variant="overline" color="primary.main" fontWeight={850} letterSpacing=".12em">DEIN COCKPIT · {year}</Typography><Typography component="h1" variant="h2" sx={{ mt: .25 }}>Hallo {name}</Typography><Typography color="text.secondary" sx={{ mt: .5 }}>Deine Leistung, dein Rhythmus, dein nächster Schritt.</Typography></Box>
          <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={onImport}>TCX importieren</Button>
        </Stack>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)', lg: 'repeat(5, 1fr)' }, gap: 1, mt: 3 }}>
          {metrics.map((metric) => <Box key={metric.label} sx={{ p: 1.5, borderRadius: 3, bgcolor: alpha(theme.palette.background.paper, .62), border: '1px solid', borderColor: 'divider', minWidth: 0 }}><Stack direction="row" gap={.75} alignItems="center" color="primary.main" sx={{ '& svg': { fontSize: 18 } }}><>{metric.icon}</><Typography variant="caption" color="text.secondary" fontWeight={700}>{metric.label}</Typography></Stack>{loading ? <Skeleton width="70%" sx={{ mt: .75 }} /> : <Typography fontWeight={800} sx={{ mt: .5, fontSize: { xs: '.92rem', sm: '1.05rem' } }} noWrap>{metric.value}</Typography>}</Box>)}
        </Box>
      </CardContent>
    </Card>
  )
}

function CoachCard({ statement, loading }: { statement?: string; loading: boolean }) {
  return <Card sx={{ flex: 1, background: (theme) => `linear-gradient(145deg, ${alpha(theme.palette.primary.main, .16)}, ${theme.palette.background.paper} 72%)` }}><CardContent sx={{ p: 2.5 }}><Stack direction="row" justifyContent="space-between"><Box><Typography variant="overline" color="primary.main" fontWeight={800}>BASELINE CYCLING COACH</Typography><Typography variant="h3">Dein Trainingsimpuls</Typography></Box><Avatar sx={{ bgcolor: 'primary.main', color: 'primary.contrastText' }}><AutoAwesomeRoundedIcon /></Avatar></Stack>{loading ? <Skeleton variant="rounded" height={72} sx={{ mt: 2 }} /> : <Typography sx={{ mt: 2, lineHeight: 1.7 }}>{statement || 'Sammle noch ein paar Aktivitäten, damit Baseline Cycling einen belastbaren persönlichen Trend für dich erkennt.'}</Typography>}<Button component={RouterLink} to="/coach" endIcon={<ArrowForwardRoundedIcon />} sx={{ mt: 1.5, px: 0 }}>Coach öffnen</Button></CardContent></Card>
}

function WeekProgress({ distanceKm, targetKm, progress, trainingLoad, loading, goalTitle }: { distanceKm: number; targetKm: number | null; progress: number; trainingLoad: number; loading: boolean; goalTitle?: string }) {
  return <Card><CardContent sx={{ p: 2.5 }}><Stack direction="row" justifyContent="space-between" alignItems="center"><Box><Typography variant="overline" color="primary.main" fontWeight={800}>ZIELFORTSCHRITT</Typography><Typography variant="h3">{loading ? '–' : targetKm ? `${distanceKm.toLocaleString('de-DE', { maximumFractionDigits: 1 })} von ${targetKm.toLocaleString('de-DE', { maximumFractionDigits: 1 })} km` : 'Kein Wochenziel konfiguriert'}</Typography>{goalTitle && <Typography variant="caption" color="text.secondary">{goalTitle}</Typography>}</Box><Box sx={{ position: 'relative', display: 'inline-flex' }}><CircularProgress variant="determinate" value={progress} size={58} thickness={5} /><Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}><Typography variant="caption" fontWeight={800}>{targetKm ? `${Math.round(progress)}%` : '–'}</Typography></Box></Box></Stack><LinearProgress variant="determinate" value={progress} sx={{ mt: 2, height: 8, borderRadius: 8 }} /><Stack direction="row" justifyContent="space-between" alignItems="center" gap={1} sx={{ mt: 1 }}><Typography variant="caption" color="text.secondary">{targetKm ? `${Math.max(0, targetKm - distanceKm).toLocaleString('de-DE', { maximumFractionDigits: 1 })} km bis zum Wochenziel` : 'Lege im Bereich Ziele ein Wochen- oder Monatsziel an.'}</Typography><Chip size="small" icon={<TrendingUpRoundedIcon />} label={`Belastung ${Math.round(trainingLoad)}`} /></Stack></CardContent></Card>
}

function RecordCard({ records, fallback, loading }: { records?: Awaited<ReturnType<typeof insightsApi.records>>; fallback?: Activity; loading: boolean }) {
  const record = records?.longest_ride
  const distance = record?.distance_m ?? fallback?.distance_m
  const title = record?.title ?? fallback?.title
  return <Card sx={{ height: '100%' }}><CardContent sx={{ p: 2.25 }}><Stack direction="row" justifyContent="space-between"><Box><Typography variant="overline" color="text.secondary" fontWeight={800}>PERSÖNLICHER REKORD</Typography><Typography variant="h4">Längste Tour</Typography></Box><EmojiEventsRoundedIcon color="primary" /></Stack>{loading ? <Skeleton sx={{ mt: 2 }} /> : <><Typography variant="h3" sx={{ mt: 2, fontSize: '1.75rem' }}>{formatDistance(distance)}</Typography><Typography variant="body2" color="text.secondary" noWrap>{title ?? 'Noch kein Rekord'}</Typography></>}<Button component={RouterLink} to="/rekorde" endIcon={<ArrowForwardRoundedIcon />} sx={{ mt: 1.25, px: 0 }}>Alle Rekorde</Button></CardContent></Card>
}

function WeatherWidget({ activity }: { activity?: Activity }) {
  const weather = activity?.weather
  return <Card sx={{ height: '100%' }}><CardContent sx={{ p: 2.25 }}><Stack direction="row" justifyContent="space-between"><Box><Typography variant="overline" color="text.secondary" fontWeight={800}>NÄCHSTE AUSFAHRT</Typography><Typography variant="h4">Wettercheck</Typography></Box><ThermostatRoundedIcon sx={{ color: 'chart.blue' }} /></Stack>{weather ? <><Stack direction="row" gap={1} alignItems="baseline" sx={{ mt: 2 }}><Typography variant="h3" sx={{ fontSize: '1.75rem' }}>{weather.temperature_c == null ? '–' : `${Math.round(weather.temperature_c)} °C`}</Typography><Typography color="text.secondary">{weather.condition ?? 'zuletzt gemessen'}</Typography></Stack><Typography variant="caption" color="text.secondary">Letztes Wettersignal · {activity?.title}</Typography></> : <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>Noch keine Wetterdaten verfügbar. Baseline Cycling ergänzt den Wetterkontext automatisch zu deinen Fahrten.</Typography>}</CardContent></Card>
}

function DashboardActivityCard({ activity }: { activity: Activity }) {
  const navigate = useNavigate()
  const weather = activity.weather
  const values = [
    { icon: <RouteRoundedIcon />, label: 'Distanz', value: formatDistance(activity.distance_m) },
    { icon: <LandscapeRoundedIcon />, label: 'Anstieg', value: formatElevation(activity.elevation_gain_m) },
    { icon: <SpeedRoundedIcon />, label: 'Ø Tempo', value: formatSpeedMps(activity.avg_speed_mps) },
    { icon: <FavoriteRoundedIcon />, label: 'Ø Puls', value: formatHeartRate(activity.avg_hr_bpm) },
  ]
  return <Card><CardActionArea onClick={() => navigate(`/aktivitaeten/${activity.id}`)} sx={{ p: { xs: 2, sm: 2.25 }, height: '100%' }}><Stack direction="row" gap={2} alignItems="flex-start"><Avatar variant="rounded" sx={{ width: 48, height: 48, borderRadius: 3, bgcolor: 'primary.main', color: 'primary.contrastText' }}><DirectionsBikeRoundedIcon /></Avatar><Box sx={{ flex: 1, minWidth: 0 }}><Stack direction="row" justifyContent="space-between" gap={1}><Box sx={{ minWidth: 0 }}><Typography variant="h4" noWrap>{activity.title}</Typography><Typography variant="caption" color="text.secondary">{formatDateTime(activity.started_at)}</Typography></Box>{(weather?.temperature_c != null || weather?.condition) && <Chip size="small" icon={<ThermostatRoundedIcon />} label={[weather.temperature_c == null ? null : `${Math.round(weather.temperature_c)}°`, weather.condition].filter(Boolean).join(' · ')} sx={{ display: { xs: 'none', sm: 'flex' } }} />}</Stack><Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1.25, mt: 2 }}>{values.map((item) => <Stack key={item.label} direction="row" gap={.75} alignItems="center" minWidth={0} sx={{ '& svg': { fontSize: 18, color: 'text.secondary' } }}><>{item.icon}</><Box minWidth={0}><Typography variant="caption" color="text.secondary" display="block">{item.label}</Typography><Typography variant="body2" fontWeight={750} noWrap>{item.value}</Typography></Box></Stack>)}</Box></Box></Stack></CardActionArea></Card>
}
