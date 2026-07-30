import { useEffect, useState } from 'react'
import AccessTimeRoundedIcon from '@mui/icons-material/AccessTimeRounded'
import AutorenewRoundedIcon from '@mui/icons-material/AutorenewRounded'
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded'
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded'
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded'
import EditRoundedIcon from '@mui/icons-material/EditRounded'
import FavoriteRoundedIcon from '@mui/icons-material/FavoriteRounded'
import InsightsRoundedIcon from '@mui/icons-material/InsightsRounded'
import LandscapeRoundedIcon from '@mui/icons-material/LandscapeRounded'
import MoreVertRoundedIcon from '@mui/icons-material/MoreVertRounded'
import RouteRoundedIcon from '@mui/icons-material/RouteRounded'
import SpeedRoundedIcon from '@mui/icons-material/SpeedRounded'
import TimerRoundedIcon from '@mui/icons-material/TimerRounded'
import WaterDropRoundedIcon from '@mui/icons-material/WaterDropRounded'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Checkbox,
  FormControl,
  IconButton,
  InputLabel,
  Menu,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
  Tooltip,
  useTheme,
} from '@mui/material'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom'
import { activitiesApi, insightsApi, segmentsApi, type Activity, type ActivityUpdate, type PersonalRecordsResponse } from '../api'
import { ActivityCharts } from '../components/ActivityCharts'
import { ActivityPhotoGallery } from '../components/ActivityPhotoGallery'
import { RouteTextAlternative } from '../components/RouteTextAlternative'
import { AiSummaryCard } from '../components/AiSummaryCard'
import { MetricCard } from '../components/MetricCard'
import { OverlayExportDialog } from '../components/OverlayExportDialog'
import { ContentLoading, ErrorState } from '../components/States'
import { TrackMap } from '../components/TrackMap'
import { WeatherCard } from '../components/WeatherCard'
import type { AchievementInfo } from '../share/types'
import {
  activityTypeLabels,
  activityTypes,
  errorMessage,
  formatDateTime,
  formatDistance,
  formatDuration,
  formatElevation,
  formatHeartRate,
  formatHydration,
  formatSpeedMps,
} from '../utils/format'

export function ActivityDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const client = useQueryClient()
  const theme = useTheme()
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null)
  const activity = useQuery({ queryKey: ['activity', id], queryFn: () => activitiesApi.get(id), enabled: Boolean(id) })
  const track = useQuery({ queryKey: ['activity', id, 'track'], queryFn: () => activitiesApi.track(id), enabled: Boolean(id) })
  const records = useQuery({ queryKey: ['statistics', 'records'], queryFn: insightsApi.records, enabled: Boolean(id) && exportOpen })
  const remove = useMutation({
    mutationFn: () => activitiesApi.delete(id),
    onSuccess: async () => {
      await Promise.all([client.invalidateQueries({ queryKey: ['activities'] }), client.invalidateQueries({ queryKey: ['statistics'] })])
      navigate('/aktivitaeten', { replace: true })
    },
  })
  const reanalyze = useMutation({
    mutationFn: () => activitiesApi.reanalyze(id),
    onSuccess: async (updated) => {
      client.setQueryData(['activity', id], updated)
      await Promise.all([
        client.invalidateQueries({ queryKey: ['activity', id, 'track'] }),
        client.invalidateQueries({ queryKey: ['activity', id, 'summary'] }),
        client.invalidateQueries({ queryKey: ['activities'] }),
        client.invalidateQueries({ queryKey: ['statistics'] }),
      ])
    },
  })

  if (activity.isLoading) return <ContentLoading label="Aktivität wird geladen …" />
  if (activity.isError || !activity.data) return <ErrorState error={activity.error ?? new Error('Aktivität nicht gefunden.')} onRetry={() => void activity.refetch()} />
  const item = activity.data
  const points = track.data?.points ?? []
  const achievement = achievementForActivity(item.id, records.data)

  return (
    <>
      <Button component={RouterLink} to="/aktivitaeten" color="inherit" startIcon={<ArrowBackRoundedIcon />} sx={{ mb: 2 }}>Alle Aktivitäten</Button>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'flex-end' }} gap={2.5} sx={{ mb: 3 }}>
        <Box sx={{ minWidth: 0 }}>
          <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap" sx={{ mb: .75 }}>
            <Chip color="primary" size="small" label={activityTypeLabels[item.type] ?? item.type} />
            <Typography variant="body2" color="text.secondary">{formatDateTime(item.started_at)}</Typography>
          </Stack>
          <Typography variant="h2" component="h1">{item.title}</Typography>
          {item.original_filename && <Typography variant="caption" color="text.secondary">Importiert aus {item.original_filename}</Typography>}
        </Box>
        <Stack direction="row" gap={1} flexWrap="wrap">
          <Button variant="outlined" startIcon={<AutorenewRoundedIcon />} disabled={reanalyze.isPending} onClick={() => reanalyze.mutate()}>
            {reanalyze.isPending ? 'Wird neu berechnet …' : 'Analyse neu berechnen'}
          </Button>
          <Button variant="outlined" startIcon={<EditRoundedIcon />} onClick={() => setEditOpen(true)}>Bearbeiten</Button>
          <Button variant="contained" startIcon={<DownloadRoundedIcon />} onClick={() => setExportOpen(true)}>PNG-Overlay</Button>
          <Tooltip title="Weitere Aktionen">
            <IconButton
              aria-label="Weitere Aktionen"
              aria-controls={menuAnchor ? 'activity-actions-menu' : undefined}
              aria-haspopup="true"
              aria-expanded={menuAnchor ? 'true' : undefined}
              onClick={(event) => setMenuAnchor(event.currentTarget)}
              sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3 }}
            >
              <MoreVertRoundedIcon />
            </IconButton>
          </Tooltip>
        </Stack>
      </Stack>

      <Menu
        id="activity-actions-menu"
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={() => setMenuAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <MenuItem
          sx={{ color: 'error.main' }}
          onClick={() => {
            setMenuAnchor(null)
            setDeleteOpen(true)
          }}
        >
          <DeleteOutlineRoundedIcon fontSize="small" sx={{ mr: 1.25 }} />
          Aktivität löschen
        </MenuItem>
      </Menu>

      {reanalyze.isError && <Alert severity="error" sx={{ mb: 2 }}>{errorMessage(reanalyze.error)}</Alert>}

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(3, 1fr)', xl: 'repeat(6, 1fr)' }, gap: 1.5, mb: 3 }}>
        <MetricCard label="Distanz" value={formatDistance(item.distance_m)} icon={<RouteRoundedIcon />} accent={theme.palette.chart.blue} />
        <MetricCard label="Bewegungszeit" value={formatDuration(item.moving_time_s)} icon={<TimerRoundedIcon />} accent={theme.palette.chart.teal} />
        <MetricCard label="Höhenmeter" value={formatElevation(item.elevation_gain_m)} icon={<LandscapeRoundedIcon />} accent={theme.palette.chart.lime} />
        <MetricCard label="Ø Tempo" value={formatSpeedMps(item.avg_speed_mps)} icon={<SpeedRoundedIcon />} accent={theme.palette.chart.amber} />
        <MetricCard label="Ø Herzfrequenz" value={formatHeartRate(item.avg_hr_bpm)} icon={<FavoriteRoundedIcon />} accent={theme.palette.chart.coral} />
        <MetricCard label="Trinkmenge" value={formatHydration(item.hydration_ml)} icon={<WaterDropRoundedIcon />} accent={theme.palette.chart.blue} hint="während der Fahrt" />
      </Box>

      {item.data_quality_flags?.length ? <Card sx={{ mb: 3 }}><CardContent sx={{ p: 2.5 }}><Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={1.5}><Box><Typography variant="h3">Datenqualität & Herkunft</Typography><Typography variant="body2" color="text.secondary">Messwerte werden mit ihrer Herkunft und bekannten Einschränkungen ausgewiesen.</Typography></Box><Chip color={item.data_quality_flags.some((flag) => flag.severity === 'error') ? 'error' : 'warning'} label={`${item.data_quality_flags.length} Hinweis${item.data_quality_flags.length === 1 ? '' : 'e'}`} /></Stack><Stack spacing={.75} sx={{ mt: 1.75 }}>{item.data_quality_flags.map((flag) => <Typography key={flag.code} variant="body2"><strong>{flag.severity === 'error' ? 'Fehler' : flag.severity === 'warning' ? 'Warnung' : 'Info'}:</strong> {flag.message}</Typography>)}</Stack></CardContent></Card> : null}

      <Card sx={{ overflow: 'hidden', mb: 3 }}>
        {track.isLoading ? <ContentLoading label="Strecke wird geladen …" /> : track.isError ? <Box sx={{ p: 3 }}><ErrorState error={track.error} onRetry={() => void track.refetch()} /></Box> : <TrackMap points={points} />}
        {!track.isLoading && !track.isError && <Box sx={{ p: { xs: 2, md: 2.5 } }}><RouteTextAlternative points={points} /><SavedSegmentForm activityId={item.id} distanceM={item.distance_m} /></Box>}
      </Card>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, gap: 2.5, mb: 3 }}>
        <AiSummaryCard activityId={id} fallback={item.ai_summary} provider={item.ai_provider} dataBasis={item.ai_data_basis} />
        <WeatherCard activityId={id} fallback={item.weather} />
      </Box>

      <ActivityCharts points={points} />

      <ActivityPhotoGallery activityId={id} trackPoints={points} />

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, gap: 2.5, mt: 3 }}>
        <Card>
          <CardContent sx={{ p: 2.5 }}>
            <Typography variant="h3" sx={{ mb: 1 }}>Notizen</Typography>
            <Typography color={item.notes ? 'text.primary' : 'text.secondary'} sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
              {item.notes || 'Noch keine Notizen zu dieser Fahrt.'}
            </Typography>
            <Button startIcon={<EditRoundedIcon />} sx={{ mt: 1.5 }} onClick={() => setEditOpen(true)}>Notizen bearbeiten</Button>
          </CardContent>
        </Card>
        <HeartRateZones activity={item} />
      </Box>

      <Box sx={{ mt: 4 }}>
        <Button
          component={RouterLink}
          to={`/aktivitaeten/${id}/analyse`}
          variant="contained"
          size="large"
          fullWidth
          startIcon={<InsightsRoundedIcon />}
          sx={{ minHeight: 64, fontSize: '1.05rem' }}
        >Detaillierte Analyse</Button>
        <Typography variant="body2" color="text.secondary" textAlign="center" sx={{ mt: 1 }}>
          Karte, Diagramme und Streckenabschnitte gemeinsam untersuchen
        </Typography>
      </Box>

      <EditActivityDialog open={editOpen} onClose={() => setEditOpen(false)} activity={item} />
      <OverlayExportDialog open={exportOpen} onClose={() => setExportOpen(false)} activity={item} points={points} achievement={achievement} />
      <Dialog open={deleteOpen} onClose={() => !remove.isPending && setDeleteOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Aktivität löschen?</DialogTitle>
        <DialogContent><Typography>„{item.title}“ und die zugehörige TCX-Datei werden dauerhaft gelöscht.</Typography>{remove.isError && <Alert severity="error" sx={{ mt: 2 }}>{errorMessage(remove.error)}</Alert>}</DialogContent>
        <DialogActions sx={{ px: 3, pb: 3 }}><Button color="inherit" onClick={() => setDeleteOpen(false)}>Abbrechen</Button><Button color="error" variant="contained" disabled={remove.isPending} onClick={() => remove.mutate()}>{remove.isPending ? 'Wird gelöscht …' : 'Endgültig löschen'}</Button></DialogActions>
      </Dialog>
    </>
  )
}

function achievementForActivity(activityId: string, records?: PersonalRecordsResponse): AchievementInfo | null {
  if (!records) return null
  if (records.highest_elevation_gain?.activity_id === activityId) return { kind: 'elevation_record', label: 'Höhenmeter-Rekord', value: formatElevation(records.highest_elevation_gain.elevation_gain_m), detail: formatDistance(records.highest_elevation_gain.distance_m) }
  if (records.longest_ride?.activity_id === activityId) return { kind: 'longest_ride', label: 'Längste Tour', value: formatDistance(records.longest_ride.distance_m), detail: formatDuration(records.longest_ride.moving_time_s) }
  if (records.highest_average_speed?.activity_id === activityId) return { kind: 'fastest_ride', label: 'Schnellste Tour', value: formatSpeedMps(records.highest_average_speed.avg_speed_mps), detail: formatDistance(records.highest_average_speed.distance_m) }
  const distanceRecord = records.distance_records.find((record) => record.activity_id === activityId)
  return distanceRecord ? { kind: 'distance_pr', label: `Bestzeit über ${(distanceRecord.target_distance_m / 1000).toLocaleString('de-DE')} km`, value: formatDuration(distanceRecord.duration_s), detail: formatSpeedMps(distanceRecord.avg_speed_mps), segmentStartM: distanceRecord.segment_start_m, segmentEndM: distanceRecord.segment_end_m } : null
}

function EditActivityDialog({ open, onClose, activity }: { open: boolean; onClose: () => void; activity: Activity }) {
  const client = useQueryClient()
  const [values, setValues] = useState<ActivityUpdate>({ title: activity.title, type: activity.type, notes: activity.notes, hydration_ml: activity.hydration_ml, include_in_statistics: activity.include_in_statistics !== false })
  useEffect(() => setValues({ title: activity.title, type: activity.type, notes: activity.notes, hydration_ml: activity.hydration_ml, include_in_statistics: activity.include_in_statistics !== false }), [activity])
  const mutation = useMutation({
    mutationFn: () => activitiesApi.update(activity.id, values),
    onSuccess: async (updated) => {
      client.setQueryData(['activity', activity.id], updated)
      await client.invalidateQueries({ queryKey: ['activities'] })
      onClose()
    },
  })
  return (
    <Dialog open={open} onClose={mutation.isPending ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>Aktivität bearbeiten</DialogTitle>
      <DialogContent><Stack spacing={2.25} sx={{ pt: 1 }}>
        <TextField label="Titel" required fullWidth value={values.title ?? ''} onChange={(event) => setValues((current) => ({ ...current, title: event.target.value }))} />
        <FormControl fullWidth><InputLabel id="edit-type-label">Aktivitätstyp</InputLabel><Select labelId="edit-type-label" label="Aktivitätstyp" value={values.type ?? 'ride'} onChange={(event) => setValues((current) => ({ ...current, type: event.target.value }))}>{activityTypes.map((type) => <MenuItem key={type.value} value={type.value}>{type.label}</MenuItem>)}</Select></FormControl>
        <TextField
          label="Trinkmenge während der Aktivität"
          type="number"
          fullWidth
          value={values.hydration_ml ?? ''}
          onChange={(event) => setValues((current) => ({ ...current, hydration_ml: event.target.value === '' ? null : Number(event.target.value) }))}
          inputProps={{ min: 0, max: 20000, step: 50 }}
          helperText="In Millilitern, zum Beispiel 750 ml. Leer lassen, wenn die Menge nicht erfasst wurde."
        />
        <TextField label="Private Notizen" multiline minRows={5} fullWidth value={values.notes ?? ''} onChange={(event) => setValues((current) => ({ ...current, notes: event.target.value }))} />
        <FormControlLabel control={<Checkbox checked={values.include_in_statistics !== false} onChange={(_, checked) => setValues((current) => ({ ...current, include_in_statistics: checked }))} />} label="In Statistiken und Zielberechnungen berücksichtigen" />
        {mutation.isError && <Alert severity="error">{errorMessage(mutation.error)}</Alert>}
      </Stack></DialogContent>
      <DialogActions sx={{ px: 3, pb: 3 }}><Button color="inherit" onClick={onClose}>Abbrechen</Button><Button variant="contained" disabled={mutation.isPending || !values.title?.trim() || (values.hydration_ml != null && (values.hydration_ml < 0 || values.hydration_ml > 20000))} onClick={() => mutation.mutate()}>{mutation.isPending ? 'Wird gespeichert …' : 'Speichern'}</Button></DialogActions>
    </Dialog>
  )
}

function HeartRateZones({ activity }: { activity: Activity }) {
  const zones = Object.entries(activity.hr_zone_seconds ?? {})
  const total = zones.reduce((sum, [, seconds]) => sum + seconds, 0)
  return (
    <Card><CardContent sx={{ p: 2.5 }}><Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}><div><Typography variant="h3">Herzfrequenzzonen</Typography><Typography variant="body2" color="text.secondary">Zeit in den Trainingsbereichen</Typography></div><AccessTimeRoundedIcon color="action" /></Stack>
      {zones.length ? <Stack spacing={1.25}>{zones.map(([zone, seconds], index) => <Box key={zone}><Stack direction="row" justifyContent="space-between"><Typography variant="body2" fontWeight={700}>{zone}</Typography><Typography variant="body2" color="text.secondary">{formatDuration(seconds)}</Typography></Stack><Box sx={{ mt: .6, height: 7, borderRadius: 4, bgcolor: 'action.hover', overflow: 'hidden' }}><Box sx={{ width: `${total ? seconds / total * 100 : 0}%`, height: '100%', bgcolor: ['#4D82BC', '#5E7F1C', '#B9E878', '#E9A23B', '#E26D5A'][index % 5] }} /></Box></Box>)}</Stack> : <Typography color="text.secondary">Keine Herzfrequenzzonen verfügbar.</Typography>}
    </CardContent></Card>
  )
}

function SavedSegmentForm({ activityId, distanceM }: { activityId: string; distanceM: number }) {
  const [name, setName] = useState('')
  const [start, setStart] = useState(0)
  const [end, setEnd] = useState(Math.round(distanceM))
  const mutation = useMutation({ mutationFn: () => segmentsApi.create({ activity_id: activityId, name: name.trim() || 'Gespeichertes Segment', start_m: start, end_m: end }), onSuccess: () => setName('') })
  return <Box component="form" onSubmit={(event) => { event.preventDefault(); if (end > start) mutation.mutate() }} sx={{ mt: 2, p: 1.5, borderRadius: 2, bgcolor: 'action.hover' }}><Typography variant="body2" fontWeight={750}>Segment speichern</Typography><Stack direction={{ xs: 'column', sm: 'row' }} gap={1} sx={{ mt: 1 }}><TextField size="small" label="Name" value={name} onChange={(event) => setName(event.target.value)} /><TextField size="small" type="number" label="Start (m)" value={start} onChange={(event) => setStart(Number(event.target.value))} inputProps={{ min: 0, max: distanceM }} /><TextField size="small" type="number" label="Ende (m)" value={end} onChange={(event) => setEnd(Number(event.target.value))} inputProps={{ min: 1, max: distanceM }} /><Button type="submit" variant="outlined" disabled={mutation.isPending || end <= start}>Speichern</Button></Stack>{mutation.isSuccess && <Typography variant="caption" color="success.main">Segment gespeichert und für spätere Vergleiche verfügbar.</Typography>}{mutation.isError && <Typography variant="caption" color="error.main">Segment konnte nicht gespeichert werden.</Typography>}</Box>
}
