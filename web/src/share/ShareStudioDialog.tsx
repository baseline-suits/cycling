import { useEffect, useMemo, useRef, useState } from 'react'
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded'
import TuneRoundedIcon from '@mui/icons-material/TuneRounded'
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Slider,
  Stack,
  Switch,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import { useQuery } from '@tanstack/react-query'
import { activityPhotosApi, type ActivityPhoto } from '../api'
import { errorMessage } from '../utils/format'
import { availableMetrics } from './content'
import { BASELINE_CYCLING_SOLID_COLORS } from './design'
import { downloadPng, exportOverlayPng } from './exportPng'
import { OverlayCanvas } from './OverlayCanvas'
import { photoBlobToDataUrl } from './photoDataUrl'
import { hasRoute } from './RouteArtwork'
import { OVERLAY_TEMPLATES, templateById } from './templates'
import {
  DEFAULT_CONFIG,
  FORMAT_SPECS,
  type MetricKey,
  type OverlayBackground,
  type OverlayConfig,
  type OverlayFormatId,
  type OverlayTemplateId,
  type OverlayTheme,
  type ShareContent,
} from './types'

function usePhotoDataUrl(photo: ActivityPhoto | null) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    setUrl(null)
    if (photo) {
      activityPhotosApi.file(photo).then(photoBlobToDataUrl).then((dataUrl) => {
        if (!active) return
        setUrl(dataUrl)
      }).catch(() => setUrl(null))
    }
    return () => {
      active = false
    }
  }, [photo])
  return url
}

function ScaledPreview({ content, config, photoUrl, exportRef }: { content: ShareContent; config: OverlayConfig; photoUrl: string | null; exportRef: React.RefObject<HTMLDivElement | null> }) {
  const viewport = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const format = FORMAT_SPECS[config.formatId]
  useEffect(() => {
    const node = viewport.current
    if (!node) return
    const resize = () => setScale(Math.min(1, node.clientWidth / format.width))
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(node)
    return () => observer.disconnect()
  }, [format.width])
  return <Box ref={viewport} sx={{ width: '100%', height: format.height * scale, position: 'relative' }}><Box sx={{ width: format.width, height: format.height, transform: `scale(${scale})`, transformOrigin: 'top left' }}><OverlayCanvas ref={exportRef} content={content} config={config} photoUrl={photoUrl} /></Box></Box>
}

export function ShareStudioDialog({ open, onClose, content }: { open: boolean; onClose: () => void; content: ShareContent }) {
  const appTheme = useTheme()
  const fullScreen = useMediaQuery(appTheme.breakpoints.down('md'))
  const exportRef = useRef<HTMLDivElement>(null)
  const [config, setConfig] = useState<OverlayConfig>(DEFAULT_CONFIG)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const activity = content.kind === 'activity' ? content.activity : null
  const photoQuery = useQuery({
    queryKey: ['activity', activity?.id, 'photos'],
    queryFn: () => activityPhotosApi.list(activity!.id),
    enabled: open && Boolean(activity?.id),
  })
  const photos = content.kind === 'activity' ? (content.photos ?? photoQuery.data?.items ?? []) : []
  const selectedPhoto = photos.find((photo) => photo.id === config.photoId) ?? photos[0] ?? null
  const photoUrl = usePhotoDataUrl(config.background === 'photo' ? selectedPhoto : null)
  const routeAvailable = content.kind === 'activity' && hasRoute(content.points)
  const metrics = useMemo(() => availableMetrics(content), [content])

  useEffect(() => {
    if (!open) return
    setConfig({
      ...DEFAULT_CONFIG,
      photoId: content.kind === 'activity' ? (content.photos?.[0]?.id ?? null) : null,
      showWeather: content.kind === 'activity' && Boolean(content.activity.weather),
      showRoute: content.kind === 'activity' && hasRoute(content.points),
      metrics: content.kind === 'period' ? ['activities', 'distance', 'movingTime', 'elevation'] : DEFAULT_CONFIG.metrics,
      templateId: content.kind === 'activity' && content.achievement ? 'achievement' : 'classic',
    })
    setError(null)
  }, [open, content])

  useEffect(() => {
    if (!config.photoId && photos[0]) setConfig((current) => ({ ...current, photoId: photos[0].id }))
  }, [photos, config.photoId])

  function update<K extends keyof OverlayConfig>(key: K, value: OverlayConfig[K]) {
    setConfig((current) => ({ ...current, [key]: value }))
  }

  function chooseTemplate(id: OverlayTemplateId) {
    const template = templateById(id)
    const background = template.defaultBackground === 'photo' && photos.length === 0
      ? 'solid'
      : template.defaultBackground === 'map' && !routeAvailable ? 'solid' : template.defaultBackground
    setConfig((current) => ({ ...current, templateId: id, background, metrics: template.defaultMetrics.filter((key) => metrics.some((metric) => metric.key === key)).slice(0, 6) }))
  }

  function toggleMetric(key: MetricKey) {
    setConfig((current) => ({
      ...current,
      metrics: current.metrics.includes(key)
        ? current.metrics.filter((item) => item !== key)
        : current.metrics.length < 6 ? [...current.metrics, key] : current.metrics,
    }))
  }

  async function exportImage() {
    if (!exportRef.current) return
    setPending(true)
    setError(null)
    try {
      const blob = await exportOverlayPng(exportRef.current, config.formatId)
      const base = (content.kind === 'activity' ? content.activity.title : content.title).replace(/[^a-z0-9äöüß-]+/gi, '-').replace(/^-|-$/g, '').toLowerCase()
      downloadPng(blob, `${base || 'baseline-cycling'}-${config.templateId}-${FORMAT_SPECS[config.formatId].label.replace(':', 'x')}.png`)
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setPending(false)
    }
  }

  return <Dialog open={open} onClose={pending ? undefined : onClose} fullWidth maxWidth="xl" fullScreen={fullScreen}>
    <DialogTitle>Share-Grafik gestalten</DialogTitle>
    <DialogContent sx={{ pb: 2 }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(420px, .9fr) minmax(520px, 1.1fr)' }, gap: 3 }}>
        <Stack spacing={2.5}>
          <Box>
            <Typography variant="subtitle2" fontWeight={850} mb={1}>Vorlage</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)' }, gap: 1 }}>
              {OVERLAY_TEMPLATES.map((template) => <Button key={template.id} variant={config.templateId === template.id ? 'contained' : 'outlined'} color={config.templateId === template.id ? 'primary' : 'inherit'} onClick={() => chooseTemplate(template.id)} sx={{ display: 'block', textAlign: 'left', p: 1.4, minHeight: 74 }}><Typography fontWeight={850} fontSize={13}>{template.name}</Typography><Typography fontSize={10.5} sx={{ opacity: .78 }}>{template.description}</Typography></Button>)}
            </Box>
          </Box>

          <Box>
            <Typography variant="subtitle2" fontWeight={850} mb={1}>Format und Design</Typography>
            <Stack gap={1.25}>
              <ToggleButtonGroup exclusive fullWidth size="small" value={config.formatId} onChange={(_, value: OverlayFormatId | null) => value && update('formatId', value)}>{Object.values(FORMAT_SPECS).map((format) => <ToggleButton key={format.id} value={format.id}>{format.label}</ToggleButton>)}</ToggleButtonGroup>
              <ToggleButtonGroup exclusive fullWidth size="small" value={config.theme} onChange={(_, value: OverlayTheme | null) => value && update('theme', value)}><ToggleButton value="light">Hell</ToggleButton><ToggleButton value="dark">Dunkel</ToggleButton></ToggleButtonGroup>
              <ToggleButtonGroup exclusive fullWidth size="small" value={config.background} onChange={(_, value: OverlayBackground | null) => value && update('background', value)}>
                <ToggleButton value="transparent">Transparent</ToggleButton><ToggleButton value="solid">Farbe</ToggleButton><ToggleButton value="map" disabled={!routeAvailable}>Karte</ToggleButton><ToggleButton value="photo" disabled={photos.length === 0}>Foto</ToggleButton>
              </ToggleButtonGroup>
            </Stack>
            {config.background === 'solid' && <Stack direction="row" gap={1} mt={1.25}>{BASELINE_CYCLING_SOLID_COLORS.map((color) => <Box component="button" aria-label={`Hintergrundfarbe ${color}`} key={color} onClick={() => update('solidColor', color)} sx={{ width: 34, height: 34, borderRadius: '50%', border: '3px solid', borderColor: config.solidColor === color ? 'primary.main' : 'divider', bgcolor: color, cursor: 'pointer' }} />)}</Stack>}
            {config.background === 'photo' && photos.length > 0 && <Box mt={1.5}><Stack direction="row" gap={1} sx={{ overflowX: 'auto', pb: .5 }}>{photos.map((photo) => <Button key={photo.id} size="small" variant={selectedPhoto?.id === photo.id ? 'contained' : 'outlined'} onClick={() => update('photoId', photo.id)}>{photo.caption || photo.original_filename}</Button>)}</Stack><Typography variant="caption" color="text.secondary">Vertikaler Bildausschnitt</Typography><Slider min={0} max={100} value={config.photoPosition} onChange={(_, value) => update('photoPosition', value as number)} /></Box>}
            {config.background === 'photo' && photoQuery.isError && <Alert severity="warning" sx={{ mt: 1 }}>{errorMessage(photoQuery.error)}</Alert>}
          </Box>

          <Box>
            <Stack direction="row" alignItems="center" gap={1}><TuneRoundedIcon fontSize="small" /><Typography variant="subtitle2" fontWeight={850}>Inhalte</Typography></Stack>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', mt: .5 }}>
              <FormControlLabel control={<Switch checked={config.showRoute} onChange={(event) => update('showRoute', event.target.checked)} disabled={!routeAvailable} />} label="Route" />
              <FormControlLabel control={<Switch checked={config.showTitle} onChange={(event) => update('showTitle', event.target.checked)} />} label="Titel" />
              <FormControlLabel control={<Switch checked={config.showDate} onChange={(event) => update('showDate', event.target.checked)} />} label="Datum" />
              <FormControlLabel control={<Switch checked={config.showWeather} onChange={(event) => update('showWeather', event.target.checked)} disabled={content.kind !== 'activity' || !content.activity.weather} />} label="Wetter" />
              <FormControlLabel control={<Switch checked={config.showBrand} onChange={(event) => update('showBrand', event.target.checked)} />} label="Baseline Cycling-Branding" />
            </Box>
            <Typography variant="caption" color="text.secondary">Bis zu sechs Kennzahlen</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', mt: .5 }}>{metrics.map((metric) => <FormControlLabel key={metric.key} control={<Checkbox size="small" checked={config.metrics.includes(metric.key)} onChange={() => toggleMetric(metric.key)} disabled={!config.metrics.includes(metric.key) && config.metrics.length >= 6} />} label={<Typography variant="body2">{metric.label}</Typography>} />)}</Box>
          </Box>
        </Stack>

        <Box sx={{ minWidth: 0 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}><Typography variant="subtitle2" fontWeight={850}>Live-Vorschau</Typography><Stack direction="row" gap={.75}><Chip size="small" label={FORMAT_SPECS[config.formatId].label} />{config.background === 'transparent' && <Chip size="small" label="Transparent" />}</Stack></Stack>
          <Box sx={{ p: { xs: 1, sm: 2 }, borderRadius: 3, overflow: 'hidden', backgroundColor: '#D9E0DE', backgroundImage: 'linear-gradient(45deg,#C5CECB 25%,transparent 25%),linear-gradient(-45deg,#C5CECB 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#C5CECB 75%),linear-gradient(-45deg,transparent 75%,#C5CECB 75%)', backgroundSize: '24px 24px', backgroundPosition: '0 0,0 12px,12px -12px,-12px 0' }}><ScaledPreview content={content} config={config} photoUrl={photoUrl} exportRef={exportRef} /></Box>
        </Box>
      </Box>
      {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
    </DialogContent>
    <DialogActions sx={{ px: 3, pb: 2.5 }}><Button color="inherit" onClick={onClose}>Schließen</Button><Button variant="contained" startIcon={<DownloadRoundedIcon />} disabled={pending} onClick={exportImage}>{pending ? 'PNG wird erstellt …' : 'PNG exportieren'}</Button></DialogActions>
  </Dialog>
}
