import { useState } from 'react'
import ShareRoundedIcon from '@mui/icons-material/ShareRounded'
import { Alert, Box, Button, Card, CardContent, MenuItem, Skeleton, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material'
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { ActivityType } from '../../../api'
import { EmptyState, ErrorState } from '../../../components/States'
import { useStatisticsViewModel, analyticsChartLabel, type StatisticsPreset } from '../../../features/analytics/useAnalyticsViewModels'
import { ShareStudioDialog } from '../../../share/ShareStudioDialog'
import { formatChartValue, formatDistance, formatDuration, formatElevation, formatHeartRate, formatSpeedMps } from '../../../utils/format'
import { AnalyticsHeader, ChartPanel, Metric, SectionHeading, tooltipStyle } from './AnalyticsUi'

const presetLabels: Record<StatisticsPreset, string> = { last_week: 'Letzte Woche', four_weeks: '4 Wochen', last_month: 'Letzter Monat', last_quarter: 'Letztes Quartal', year: 'Dieses Jahr', custom: 'Eigener Zeitraum' }
const typeLabels: Record<ActivityType | 'all', string> = { all: 'Alle Sportarten', ride: 'Radfahrt', training: 'Training', tour: 'Tour', commute: 'Pendeln', indoor: 'Indoor', other: 'Sonstige' }

function displayDate(value: string) {
  return new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(`${value}T12:00:00`))
}

export function MinimalStatisticsPage() {
  const vm = useStatisticsViewModel()
  const [shareOpen, setShareOpen] = useState(false)
  const data = vm.query.data
  const comparison = data?.comparison
  const change = (...keys: string[]) => {
    for (const key of keys) if (comparison?.changes[key] !== undefined) return comparison.changes[key]
    return null
  }
  const series = (data?.series ?? []).map((point) => ({ ...point, label: analyticsChartLabel(point.period_start, data?.granularity ?? 'day'), distanceKm: point.distance_m / 1000, movingHours: point.moving_time_s / 3600, speedKmh: point.avg_speed_mps == null ? null : point.avg_speed_mps * 3.6 }))
  const previousHint = comparison ? `gegen ${displayDate(comparison.date_from)} bis ${displayDate(comparison.date_to)}` : undefined

  return <Stack spacing={{ xs: 6, md: 8 }}>
    <AnalyticsHeader eyebrow="Training in Zahlen" title="Statistiken, die Zusammenhänge zeigen." description="Umfang, Belastung und Leistung für einen frei wählbaren Zeitraum – mit derselben Sportart in der direkt vorhergehenden Periode verglichen." action={<Button variant="outlined" startIcon={<ShareRoundedIcon />} disabled={!data?.activity_count} onClick={() => setShareOpen(true)}>Rückblick teilen</Button>} />

    <Card component="section" aria-label="Statistik filtern" sx={{ bgcolor: 'var(--avento-minimal-surface-raised)' }}><CardContent sx={{ p: { xs: 2.5, md: 3.5 } }}><Stack spacing={2.5}>
      <ToggleButtonGroup exclusive value={vm.preset} onChange={(_, value: StatisticsPreset | null) => value && vm.update({ preset: value })} aria-label="Zeitraum auswählen" sx={{ flexWrap: 'wrap', '& .MuiToggleButtonGroup-grouped': { borderRadius: '8px !important', m: .35, border: '1px solid' } }}>{(Object.keys(presetLabels) as StatisticsPreset[]).map((id) => <ToggleButton key={id} value={id}>{presetLabels[id]}</ToggleButton>)}</ToggleButtonGroup>
      <Stack direction={{ xs: 'column', sm: 'row' }} gap={1.5}><TextField type="date" label="Von" value={vm.from} onChange={(event) => vm.update({ preset: 'custom', from: event.target.value })} slotProps={{ inputLabel: { shrink: true } }} fullWidth /><TextField type="date" label="Bis" value={vm.to} onChange={(event) => vm.update({ preset: 'custom', to: event.target.value })} slotProps={{ inputLabel: { shrink: true } }} fullWidth /><TextField select label="Sportart" value={vm.type} onChange={(event) => vm.update({ type: event.target.value as ActivityType | 'all' })} fullWidth>{Object.entries(typeLabels).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}</TextField></Stack>
      {!vm.rangeIsValid && <Alert severity="error">Das Startdatum muss vor dem Enddatum liegen.</Alert>}
    </Stack></CardContent></Card>

    {vm.query.isLoading && <Stack spacing={2}><Skeleton variant="rounded" height={160} /><Skeleton variant="rounded" height={360} /></Stack>}
    {vm.query.isError && <ErrorState error={vm.query.error} onRetry={() => void vm.query.refetch()} />}
    {data && data.activity_count === 0 && <EmptyState title="In diesem Zeitraum ist noch nichts erfasst" description="Wähle einen anderen Zeitraum oder eine andere Sportart. Baseline Cycling zeigt keine Schätzwerte an." />}
    {data && data.activity_count > 0 && <>
      <Box component="section" aria-labelledby="scope-title"><SectionHeading id="scope-title" eyebrow="Umfang & Belastung" title={`${data.activity_count} ${data.activity_count === 1 ? 'Aktivität' : 'Aktivitäten'} im gewählten Zeitraum.`} description={previousHint ? `Alle Veränderungen beziehen sich auf ${previousHint}. Pfeile und Vorzeichen machen die Richtung auch ohne Farbe verständlich.` : 'Für diesen Zeitraum ist kein Vorperiodenvergleich verfügbar.'} /><Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2,minmax(0,1fr))', md: 'repeat(4,minmax(0,1fr))' }, gap: { xs: 2, md: 4 }, mt: 4 }}><Metric label="Distanz" value={formatDistance(data.distance_m)} change={change('distance_m')} hint="zur Vorperiode" /><Metric label="Bewegungszeit" value={formatDuration(data.moving_time_s)} change={change('moving_time_s')} hint="zur Vorperiode" /><Metric label="Höhenmeter" value={formatElevation(data.elevation_gain_m)} change={change('elevation_gain_m')} hint="zur Vorperiode" /><Metric label="Trainingsbelastung" value={Math.round(data.training_load).toLocaleString('de-DE')} change={change('training_load')} hint="zur Vorperiode" /></Box></Box>
      <Box component="section" aria-labelledby="performance-title"><SectionHeading id="performance-title" eyebrow="Leistung" title="Tempo und Herzfrequenz im Kontext." /><Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2,minmax(0,1fr))', md: 'repeat(4,minmax(0,1fr))' }, gap: { xs: 2, md: 4 }, mt: 4 }}><Metric label="Ø Geschwindigkeit" value={formatSpeedMps(data.avg_speed_mps)} change={change('avg_speed_mps')} hint="zur Vorperiode" /><Metric label="Ø Herzfrequenz" value={formatHeartRate(data.avg_hr_bpm)} change={change('avg_hr_bpm')} hint="zur Vorperiode" /><Metric label="Gesamtzeit" value={formatDuration(data.duration_s)} change={change('duration_s')} hint="zur Vorperiode" /><Metric label="Fahrten" value={String(data.activity_count)} change={change('activity_count', 'activities')} hint="zur Vorperiode" /></Box></Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: 'repeat(2,minmax(0,1fr))' }, gap: 2 }}>
        <ChartPanel title="Trainingsumfang" description="Distanz und Bewegungszeit verwenden getrennte, klar beschriftete Skalen." summary={`Insgesamt ${formatDistance(data.distance_m)} und ${formatDuration(data.moving_time_s)} Bewegungszeit.`}><ResponsiveContainer width="100%" height={310}><ComposedChart data={series} margin={{ top: 10, right: 8, left: -8, bottom: 0 }}><CartesianGrid vertical={false} stroke="rgba(255,255,255,.1)" strokeDasharray="4 4" /><XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} /><YAxis yAxisId="distance" width={45} unit=" km" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} /><YAxis yAxisId="time" orientation="right" width={42} unit=" h" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} /><Tooltip contentStyle={tooltipStyle} formatter={(value, name) => [formatChartValue(value, 1), name]} /><Legend /><Bar yAxisId="distance" dataKey="distanceKm" name="Distanz (km)" fill="#65c8c1" radius={[5, 5, 0, 0]} isAnimationActive={false} /><Line yAxisId="time" dataKey="movingHours" name="Bewegungszeit (h)" stroke="#e1b25d" strokeWidth={2.5} dot={false} isAnimationActive={false} /></ComposedChart></ResponsiveContainer></ChartPanel>
        <ChartPanel title="Tempo & Puls" description="Zwei Einheiten, deshalb zwei sichtbare Skalen." summary={`Durchschnittlich ${formatSpeedMps(data.avg_speed_mps)} und ${formatHeartRate(data.avg_hr_bpm)}.`}><ResponsiveContainer width="100%" height={310}><ComposedChart data={series} margin={{ top: 10, right: 8, left: -8, bottom: 0 }}><CartesianGrid vertical={false} stroke="rgba(255,255,255,.1)" strokeDasharray="4 4" /><XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} /><YAxis yAxisId="speed" width={52} unit=" km/h" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} /><YAxis yAxisId="heart" orientation="right" width={50} unit=" bpm" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} /><Tooltip contentStyle={tooltipStyle} formatter={(value, name) => [formatChartValue(value, 1), name]} /><Legend /><Line yAxisId="speed" dataKey="speedKmh" name="Ø Geschwindigkeit" stroke="#65c8c1" strokeWidth={2.5} dot={false} connectNulls isAnimationActive={false} /><Line yAxisId="heart" dataKey="avg_hr_bpm" name="Ø Herzfrequenz" stroke="#e77b73" strokeWidth={2.5} strokeDasharray="7 4" dot={false} connectNulls isAnimationActive={false} /></ComposedChart></ResponsiveContainer></ChartPanel>
      </Box>
    </>}
    {data && <ShareStudioDialog open={shareOpen} onClose={() => setShareOpen(false)} content={{ kind: 'period', periodKind: vm.preset === 'last_week' ? 'week' : vm.preset === 'last_month' ? 'month' : vm.preset === 'year' ? 'year' : 'custom', title: 'Mein Trainingsrückblick', dateLabel: `${displayDate(vm.from)} – ${displayDate(vm.to)}`, statistics: data }} />}
  </Stack>
}
