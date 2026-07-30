import { useMemo, useState } from 'react'
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded'
import CompareArrowsRoundedIcon from '@mui/icons-material/CompareArrowsRounded'
import EmojiEventsRoundedIcon from '@mui/icons-material/EmojiEventsRounded'
import FavoriteRoundedIcon from '@mui/icons-material/FavoriteRounded'
import SpeedRoundedIcon from '@mui/icons-material/SpeedRounded'
import { alpha } from '@mui/material/styles'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  useTheme,
} from '@mui/material'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { activitiesApi, type Activity, type ActivityComparisonMetric } from '../api'
import { ActivityCard } from '../components/ActivityCard'
import { EmptyState, ErrorState } from '../components/States'
import { MarkdownText } from '../components/MarkdownText'
import { PageHeader } from '../components/PageHeader'
import { errorMessage, formatChartValue, formatDistance, formatDuration, formatElevation, formatHeartRate, formatSpeedMps } from '../utils/format'

type ProfileMetric = 'elevation_m' | 'speed_kmh' | 'heart_rate_bpm'

const profileMetricConfig: Record<ProfileMetric, { label: string; unit: string }> = {
  elevation_m: { label: 'Höhe', unit: 'm' },
  speed_kmh: { label: 'Geschwindigkeit', unit: 'km/h' },
  heart_rate_bpm: { label: 'Herzfrequenz', unit: 'bpm' },
}

function score(value: number | null) {
  if (value == null) return '–'
  return `${value.toLocaleString('de-DE', { maximumFractionDigits: 0 })} Punkte`
}

function efficiency(value: number | null) {
  return value == null ? '–' : `${value.toLocaleString('de-DE', { maximumFractionDigits: 3 })} km/h je bpm`
}

function wind(value: number | null) {
  if (value == null) return '–'
  if (Math.abs(value) < 0.5) return 'nahezu neutral'
  return `${Math.abs(value).toLocaleString('de-DE', { maximumFractionDigits: 1 })} km/h ${value > 0 ? 'Gegenwind' : 'Rückenwind'}`
}

export function ComparePage() {
  const [selected, setSelected] = useState<string[]>([])
  const [profileMetric, setProfileMetric] = useState<ProfileMetric>('elevation_m')
  const theme = useTheme()
  const colors = [theme.palette.chart.teal, theme.palette.chart.coral, theme.palette.chart.blue, theme.palette.chart.amber]
  const list = useQuery({ queryKey: ['activities', 'compare-picker'], queryFn: () => activitiesApi.list({ limit: 50 }) })
  const compare = useMutation({ mutationFn: activitiesApi.compare })

  function toggle(activity: Activity) {
    compare.reset()
    setSelected((current) => current.includes(activity.id) ? current.filter((id) => id !== activity.id) : current.length < 4 ? [...current, activity.id] : current)
  }

  const result = compare.data?.activities ?? []
  const routeMatches = useQuery({ queryKey: ['route-matches', result[0]?.id], queryFn: () => activitiesApi.routeMatches(result[0].id), enabled: result.length > 0 })
  const metrics: ActivityComparisonMetric[] = compare.data?.metrics?.length ? compare.data.metrics : result.map((activity) => ({
    activity_id: activity.id,
    title: activity.title,
    distance_m: activity.distance_m,
    duration_s: activity.duration_s,
    moving_time_s: activity.moving_time_s,
    elevation_gain_m: activity.elevation_gain_m,
    avg_speed_mps: activity.avg_speed_mps,
    avg_hr_bpm: activity.avg_hr_bpm,
    max_hr_bpm: activity.max_hr_bpm,
    efficiency_kmh_per_bpm: activity.avg_speed_mps != null && activity.avg_hr_bpm ? activity.avg_speed_mps * 3.6 / activity.avg_hr_bpm : null,
    headwind_kmh: null,
    relative_score: null,
  }))
  const profiles = compare.data?.profiles ?? []
  const profileData = useMemo(() => {
    const rows = new Map<number, Record<string, number | null>>()
    profiles.forEach((profile, profileIndex) => {
      profile.points.forEach((point) => {
        const progress = Math.round(point.progress_percent * 10) / 10
        const row = rows.get(progress) ?? { progress }
        row[`activity_${profileIndex}`] = point[profileMetric]
        rows.set(progress, row)
      })
    })
    return Array.from(rows.values()).sort((left, right) => Number(left.progress) - Number(right.progress))
  }, [profiles, profileMetric])
  const fastest = [...metrics].filter((item) => item.avg_speed_mps != null).sort((left, right) => (right.avg_speed_mps ?? 0) - (left.avg_speed_mps ?? 0))[0]
  const mostEfficient = [...metrics].filter((item) => item.efficiency_kmh_per_bpm != null).sort((left, right) => (right.efficiency_kmh_per_bpm ?? 0) - (left.efficiency_kmh_per_bpm ?? 0))[0]
  const bestScore = [...metrics].filter((item) => item.relative_score != null).sort((left, right) => (right.relative_score ?? 0) - (left.relative_score ?? 0))[0]
  const windData = metrics.map((item) => ({ ...item, shortTitle: item.title.length > 18 ? `${item.title.slice(0, 18)}…` : item.title }))
  const tooltipStyle = { borderRadius: 14, border: `1px solid ${theme.palette.divider}`, boxShadow: '0 12px 30px rgba(20,50,45,.08)' }

  return (
    <>
      <PageHeader
        eyebrow="FAHRT GEGEN FAHRT"
        title="Professioneller Vergleich"
        description="Vergleiche nicht nur Gesamtwerte: normalisierte Verläufe, Puls-Effizienz, Windeinfluss und Baseline Cycling Insight zeigen, warum eine Fahrt stärker war."
      />

      {list.isError && <ErrorState error={list.error} onRetry={() => void list.refetch()} />}
      {list.isLoading && <Skeleton variant="rounded" height={320} />}
      {list.data?.items.length === 0 && <EmptyState title="Keine Fahrten zum Vergleichen" description="Importiere mindestens zwei Aktivitäten." />}
      {list.data && list.data.items.length > 0 && (
        <Card>
          <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ xs: 'stretch', sm: 'center' }} justifyContent="space-between" gap={2} sx={{ mb: 2 }}>
              <Box>
                <Stack direction="row" gap={1} alignItems="center"><Typography variant="h3">Fahrten auswählen</Typography><Chip color="primary" size="small" label={`${selected.length} / 4`} /></Stack>
                <Typography variant="body2" color="text.secondary" sx={{ mt: .5 }}>Wähle zwei bis vier möglichst ähnliche Fahrten.</Typography>
              </Box>
              <Button variant="contained" startIcon={<CompareArrowsRoundedIcon />} disabled={selected.length < 2 || compare.isPending} onClick={() => compare.mutate(selected)}>
                {compare.isPending ? 'KI vergleicht …' : 'Vergleich starten'}
              </Button>
            </Stack>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: '1fr 1fr' }, gap: 2, maxHeight: 460, overflow: 'auto', pr: 1 }}>
              {list.data.items.map((activity) => <ActivityCard key={activity.id} activity={activity} selected={selected.includes(activity.id)} onSelect={toggle} />)}
            </Box>
          </CardContent>
        </Card>
      )}

      {selected.length === 4 && !compare.data && <Alert severity="info" sx={{ mt: 2 }}>Vier Fahrten ausgewählt. Entferne eine, um eine andere hinzuzufügen.</Alert>}
      {compare.isError && <Alert severity="error" sx={{ mt: 2 }}>{errorMessage(compare.error)}</Alert>}
      {compare.isPending && <Stack spacing={2} sx={{ mt: 3 }}><Skeleton variant="rounded" height={180} /><Skeleton variant="rounded" height={360} /></Stack>}

      {result.length > 0 && (
        <Box sx={{ mt: 4 }}>
          {routeMatches.data?.matches?.length ? <Card sx={{ mb: 2.5 }}><CardContent sx={{ p: { xs: 2, md: 2.5 } }}><Typography variant="h3">Wiederkehrende Strecke</Typography><Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>Ähnliche Routen werden trotz kleiner GPS-Abweichungen erkannt. Die Vergleichbarkeit wird pro Fahrt ausgewiesen.</Typography><Stack spacing={1}>{routeMatches.data.matches.map((match) => <Stack key={match.activity.id} direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={1} sx={{ p: 1.25, borderRadius: 2, bgcolor: 'action.hover' }}><Box><Typography fontWeight={750}>{match.activity.title}</Typography><Typography variant="caption" color="text.secondary">Routenähnlichkeit {Math.round(match.similarity * 100)} %{match.conditions.length ? ` · ${match.conditions.join(', ')}` : ''}</Typography></Box><Chip size="small" color={match.comparable ? 'success' : 'warning'} label={match.comparable ? 'vergleichbar' : 'eingeschränkt vergleichbar'} /></Stack>)}</Stack></CardContent></Card> : null}
          <Card sx={{ mb: 2.5, background: `radial-gradient(circle at 100% 0, ${alpha(theme.palette.secondary.main, .22)}, transparent 34%), linear-gradient(145deg, ${alpha(theme.palette.primary.main, .07)}, ${theme.palette.background.paper})` }}>
            <CardContent sx={{ p: { xs: 2.5, md: 3 } }}>
              <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={2}>
                <Stack direction="row" spacing={1.25} alignItems="center">
                  <Box sx={{ width: 44, height: 44, display: 'grid', placeItems: 'center', borderRadius: 3, bgcolor: 'primary.main', color: 'white' }}><AutoAwesomeRoundedIcon /></Box>
                  <Box><Typography variant="h3">Baseline Cycling Insight</Typography><Typography variant="body2" color="text.secondary">KI-Einordnung dieses Vergleichs</Typography></Box>
                </Stack>
                {compare.data?.ai_provider && <Chip size="small" variant="outlined" label={compare.data.ai_provider} sx={{ alignSelf: 'flex-start' }} />}
              </Stack>
              <Divider sx={{ my: 2 }} />
              <MarkdownText content={compare.data?.ai_summary || 'Die Fahrten wurden datenbasiert gegenübergestellt. Für eine KI-Einordnung muss ein KI-Anbieter konfiguriert sein.'} />
            </CardContent>
          </Card>

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 2, mb: 2.5 }}>
            <LeaderCard icon={<SpeedRoundedIcon />} eyebrow="Höchstes Tempo" metric={fastest ? formatSpeedMps(fastest.avg_speed_mps) : '–'} title={fastest?.title ?? 'Keine Tempodaten'} accent={theme.palette.chart.teal} />
            <LeaderCard icon={<FavoriteRoundedIcon />} eyebrow="Beste Puls-Effizienz" metric={mostEfficient ? efficiency(mostEfficient.efficiency_kmh_per_bpm) : '–'} title={mostEfficient?.title ?? 'Keine Pulsdaten'} accent={theme.palette.chart.coral} />
            <LeaderCard icon={<EmojiEventsRoundedIcon />} eyebrow="Stärkster Gesamtscore" metric={bestScore ? score(bestScore.relative_score) : '–'} title={bestScore?.title ?? 'Noch kein Score'} accent={theme.palette.chart.amber} />
          </Box>

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: '1.35fr .85fr' }, gap: 2.5, mb: 2.5 }}>
            <Card>
              <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
                <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }} gap={1.5} sx={{ mb: 1 }}>
                  <Box><Typography variant="h3">Normalisierter Fahrtverlauf</Typography><Typography variant="body2" color="text.secondary">Alle Fahrten von 0 bis 100 % – unabhängig von ihrer Distanz</Typography></Box>
                  <ToggleButtonGroup exclusive size="small" value={profileMetric} onChange={(_, value: ProfileMetric | null) => value && setProfileMetric(value)}>
                    <ToggleButton value="elevation_m">Höhe</ToggleButton>
                    <ToggleButton value="speed_kmh">Tempo</ToggleButton>
                    <ToggleButton value="heart_rate_bpm">Puls</ToggleButton>
                  </ToggleButtonGroup>
                </Stack>
                {profileData.length ? (
                  <ResponsiveContainer width="100%" height={350}>
                    <LineChart data={profileData} margin={{ top: 20, right: 12, left: -8, bottom: 0 }}>
                      <CartesianGrid vertical={false} strokeDasharray="4 4" stroke={theme.palette.divider} />
                      <XAxis type="number" dataKey="progress" domain={[0, 100]} unit=" %" axisLine={false} tickLine={false} />
                      <YAxis width={58} domain={profileMetric === 'elevation_m' ? ['auto', 'auto'] : ['auto', 'auto']} axisLine={false} tickLine={false} tickFormatter={(value) => formatChartValue(value, 1)} label={{ value: profileMetricConfig[profileMetric].unit, angle: -90, position: 'insideLeft', fontSize: 11 }} />
                      <Tooltip contentStyle={tooltipStyle} labelFormatter={(value) => `${Number(value).toLocaleString('de-DE', { maximumFractionDigits: 1 })} % der Strecke`} formatter={(value) => formatChartValue(value, profileMetric === 'heart_rate_bpm' ? 0 : 1)} />
                      <Legend />
                      {profiles.map((profile, index) => <Line key={profile.activity_id} type="monotone" dataKey={`activity_${index}`} name={profile.title} stroke={colors[index % colors.length]} strokeWidth={2.5} dot={false} connectNulls />)}
                    </LineChart>
                  </ResponsiveContainer>
                ) : <EmptyState title="Keine Verlaufsdaten" description="Für diese Fahrten stehen noch keine normalisierten Trackdaten bereit." />}
              </CardContent>
            </Card>

            <Card>
              <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
                <Typography variant="h3">Wind & Effizienz</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Gegenwind (+) und Tempo pro Herzschlag</Typography>
                <ResponsiveContainer width="100%" height={350}>
                  <ComposedChart data={windData} margin={{ top: 10, right: 8, left: -10, bottom: 16 }}>
                    <CartesianGrid vertical={false} strokeDasharray="4 4" stroke={theme.palette.divider} />
                    <XAxis dataKey="shortTitle" interval={0} angle={-15} textAnchor="end" height={58} tick={{ fontSize: 10 }} />
                    <YAxis yAxisId="wind" width={52} axisLine={false} tickLine={false} tickFormatter={(value) => formatChartValue(value, 1)} label={{ value: 'km/h', angle: -90, position: 'insideLeft', fontSize: 11 }} />
                    <YAxis yAxisId="efficiency" orientation="right" width={58} domain={['auto', 'auto']} axisLine={false} tickLine={false} tickFormatter={(value) => formatChartValue(value, 3)} label={{ value: 'km/h je bpm', angle: 90, position: 'insideRight', fontSize: 11 }} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(value, name) => [formatChartValue(value, name === 'Effizienz' ? 3 : 1), name]} />
                    <Legend />
                    <ReferenceLine yAxisId="wind" y={0} stroke={theme.palette.divider} />
                    <Bar yAxisId="wind" dataKey="headwind_kmh" name="Gegenwind" fill={theme.palette.chart.blue} radius={[5, 5, 0, 0]} />
                    <Line yAxisId="efficiency" type="monotone" dataKey="efficiency_kmh_per_bpm" name="Effizienz" stroke={theme.palette.chart.coral} strokeWidth={3} dot={{ r: 4 }} connectNulls />
                  </ComposedChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </Box>

          <Card>
            <CardContent sx={{ p: 0 }}>
              <Box sx={{ p: { xs: 2, md: 2.5 }, pb: 1 }}><Typography variant="h3">Alle Kennzahlen</Typography><Typography variant="body2" color="text.secondary">Die belastbare Detailansicht hinter dem KI-Urteil</Typography></Box>
              <TableContainer>
                <Table size="small" sx={{ minWidth: 1050 }}>
                  <TableHead><TableRow><TableCell>Fahrt</TableCell><TableCell align="right">Distanz</TableCell><TableCell align="right">Gesamtzeit</TableCell><TableCell align="right">Bewegung</TableCell><TableCell align="right">Höhe</TableCell><TableCell align="right">Ø Tempo</TableCell><TableCell align="right">Ø / Max. Puls</TableCell><TableCell align="right">Effizienz</TableCell><TableCell align="right">Wind</TableCell><TableCell align="right">Score</TableCell></TableRow></TableHead>
                  <TableBody>{metrics.map((item, index) => (
                    <TableRow key={item.activity_id} hover>
                      <TableCell><Stack direction="row" alignItems="center" gap={1}><Box sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: colors[index % colors.length], flex: 'none' }} /><Typography fontWeight={750} variant="body2">{item.title}</Typography></Stack></TableCell>
                      <TableCell align="right">{formatDistance(item.distance_m)}</TableCell>
                      <TableCell align="right">{formatDuration(item.duration_s)}</TableCell>
                      <TableCell align="right">{formatDuration(item.moving_time_s)}</TableCell>
                      <TableCell align="right">{formatElevation(item.elevation_gain_m)}</TableCell>
                      <TableCell align="right">{formatSpeedMps(item.avg_speed_mps)}</TableCell>
                      <TableCell align="right">{formatHeartRate(item.avg_hr_bpm)} / {formatHeartRate(item.max_hr_bpm)}</TableCell>
                      <TableCell align="right">{efficiency(item.efficiency_kmh_per_bpm)}</TableCell>
                      <TableCell align="right">{wind(item.headwind_kmh)}</TableCell>
                      <TableCell align="right"><Chip size="small" label={score(item.relative_score)} /></TableCell>
                    </TableRow>
                  ))}</TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
        </Box>
      )}
    </>
  )
}

function LeaderCard({ icon, eyebrow, metric, title, accent }: { icon: React.ReactNode; eyebrow: string; metric: string; title: string; accent: string }) {
  return (
    <Card>
      <CardContent sx={{ p: 2.25 }}>
        <Stack direction="row" gap={1.5} alignItems="flex-start">
          <Box sx={{ width: 42, height: 42, display: 'grid', placeItems: 'center', flex: 'none', borderRadius: 3, color: accent, bgcolor: alpha(accent, .11) }}>{icon}</Box>
          <Box minWidth={0}><Typography variant="overline" color="text.secondary" fontWeight={800}>{eyebrow}</Typography><Typography variant="h4" noWrap>{title}</Typography><Typography color="primary.main" fontWeight={750} sx={{ mt: .5 }}>{metric}</Typography></Box>
        </Stack>
      </CardContent>
    </Card>
  )
}
