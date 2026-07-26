import { useEffect, useMemo, useState } from 'react'
import AddAPhotoRoundedIcon from '@mui/icons-material/AddAPhotoRounded'
import CalendarMonthRoundedIcon from '@mui/icons-material/CalendarMonthRounded'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded'
import EditRoundedIcon from '@mui/icons-material/EditRounded'
import CloudUploadRoundedIcon from '@mui/icons-material/CloudUploadRounded'
import ImageNotSupportedRoundedIcon from '@mui/icons-material/ImageNotSupportedRounded'
import LocationOnRoundedIcon from '@mui/icons-material/LocationOnRounded'
import PhotoLibraryRoundedIcon from '@mui/icons-material/PhotoLibraryRounded'
import PlayCircleOutlineRoundedIcon from '@mui/icons-material/PlayCircleOutlineRounded'
import ReplayRoundedIcon from '@mui/icons-material/ReplayRounded'
import VideoFileRoundedIcon from '@mui/icons-material/VideoFileRounded'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  LinearProgress,
  List,
  ListItem,
  ListItemText,
  Skeleton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  activityPhotosApi,
  activityMediaApi,
  type ActivityMedia,
  type ActivityMediaConfig,
  type ActivityMediaUpload,
  type ActivityPhotoUpdate,
  type TrackPoint,
} from '../api'
import { errorMessage, formatDateTime } from '../utils/format'
import { EmptyState, ErrorState } from './States'
import { TrackMap, type TrackMapMarker } from './TrackMap'

const defaultMediaConfig: ActivityMediaConfig = {
  image_formats: ['JPEG', 'PNG', 'WebP'],
  video_formats: ['MP4', 'MOV', 'WebM'],
  max_image_bytes: 15 * 1024 * 1024,
  max_video_bytes: 500 * 1024 * 1024,
  max_video_duration_seconds: 15 * 60,
}
const videoTypes = new Set(['video/mp4', 'video/quicktime', 'video/webm'])
const videoExtensions = /\.(mp4|mov|webm)$/i

function isVideoFile(file: File) {
  return videoTypes.has(file.type) || videoExtensions.test(file.name)
}

function localDateTimeValue(value?: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

export function capturedAtForApi(value: string) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

export function ActivityPhotoGallery({ activityId, trackPoints, mapVariant = 'classic' }: { activityId: string; trackPoints: TrackPoint[]; mapVariant?: 'classic' | 'minimal' }) {
  const client = useQueryClient()
  const [uploadOpen, setUploadOpen] = useState(false)
  const [bulkUploadOpen, setBulkUploadOpen] = useState(false)
  const [editPhoto, setEditPhoto] = useState<ActivityMedia | null>(null)
  const [deletePhoto, setDeletePhoto] = useState<ActivityMedia | null>(null)
  const [detailPhoto, setDetailPhoto] = useState<ActivityMedia | null>(null)
  const [uploadProgress, setUploadProgress] = useState(0)
  const photos = useQuery({
    queryKey: ['activity', activityId, 'media'],
    queryFn: () => activityMediaApi.list(activityId),
    enabled: Boolean(activityId),
    refetchInterval: (query) => query.state.data?.items.some((item) => ['pending', 'processing'].includes(item.processing_status)) ? 2_000 : false,
  })
  const mediaConfig = useQuery({
    queryKey: ['activity-media-config'],
    queryFn: activityMediaApi.config,
    staleTime: Number.POSITIVE_INFINITY,
  })
  const refresh = () => client.invalidateQueries({ queryKey: ['activity', activityId, 'media'] })
  const upload = useMutation({
    mutationFn: (data: ActivityMediaUpload) => isVideoFile(data.file)
      ? activityMediaApi.uploadVideo(activityId, data, setUploadProgress)
      : activityPhotosApi.upload(activityId, data, setUploadProgress),
    onSuccess: async () => {
      await refresh()
      setUploadOpen(false)
      setUploadProgress(0)
    },
  })
  const update = useMutation({
    mutationFn: ({ photoId, data }: { photoId: string; data: ActivityPhotoUpdate }) =>
      activityMediaApi.update(activityId, photoId, data),
    onSuccess: async () => {
      await refresh()
      setEditPhoto(null)
    },
  })
  const remove = useMutation({
    mutationFn: (photoId: string) => activityMediaApi.delete(activityId, photoId),
    onSuccess: async () => {
      await refresh()
      setDeletePhoto(null)
      setDetailPhoto(null)
    },
  })
  const retry = useMutation({
    mutationFn: (mediaId: string) => activityMediaApi.retry(activityId, mediaId),
    onSuccess: refresh,
  })
  const locatedPhotos = useMemo(
    () => photos.data?.items.filter((photo) => photo.latitude != null && photo.longitude != null) ?? [],
    [photos.data?.items],
  )
  const markers = useMemo<TrackMapMarker[]>(() => locatedPhotos.map((photo) => ({
    id: photo.id,
    latitude: photo.latitude!,
    longitude: photo.longitude!,
    label: photo.caption || (photo.media_type === 'video' ? 'Aktivitätsvideo' : 'Aktivitätsfoto'),
    color: '#E9A23B',
  })), [locatedPhotos])
  const displayedDetailPhoto = detailPhoto
    ? photos.data?.items.find((item) => item.id === detailPhoto.id) ?? detailPhoto
    : null

  return (
    <Box component="section" aria-labelledby="activity-media-title" sx={{ mt: 3 }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }} gap={1.5} sx={{ mb: 1.75 }}>
        <Box>
          <Stack direction="row" alignItems="center" gap={1}>
            <PhotoLibraryRoundedIcon color="primary" />
            <Typography id="activity-media-title" variant="h3">Mediengalerie</Typography>
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mt: .35 }}>
            {photos.data ? `${photos.data.total} ${photos.data.total === 1 ? 'Erinnerung' : 'Erinnerungen'} zu dieser Fahrt` : 'Momente entlang deiner Strecke'}
          </Typography>
        </Box>
        <Stack direction={{ xs: 'column', sm: 'row' }} gap={1}>
          <Button variant="outlined" startIcon={<AddAPhotoRoundedIcon />} onClick={() => { upload.reset(); setUploadOpen(true) }}>
            Foto oder Video
          </Button>
          <Button variant="contained" startIcon={<CloudUploadRoundedIcon />} onClick={() => setBulkUploadOpen(true)}>
            Mehrere Fotos
          </Button>
        </Stack>
      </Stack>

      {photos.isError && <ErrorState error={photos.error} onRetry={() => void photos.refetch()} />}
      {photos.isLoading && (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(3, 1fr)' }, gap: 1.5 }}>
          {Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} variant="rounded" height={250} />)}
        </Box>
      )}
      {photos.data && photos.data.items.length === 0 && (
        <Card>
          <EmptyState
            title="Noch keine Medien"
            description="Füge Fotos oder Videos von Landschaften, Pausen und besonderen Streckenmomenten hinzu."
            action={<Button startIcon={<AddAPhotoRoundedIcon />} onClick={() => setUploadOpen(true)}>Erstes Medium hinzufügen</Button>}
          />
        </Card>
      )}
      {photos.data && photos.data.items.length > 0 && (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', xl: 'repeat(3, 1fr)' }, gap: 1.5 }}>
          {photos.data.items.map((photo) => (
            <MediaCard
              key={photo.id}
              photo={photo}
              onOpen={() => setDetailPhoto(photo)}
              onEdit={() => { update.reset(); setEditPhoto(photo) }}
              onDelete={() => { remove.reset(); setDeletePhoto(photo) }}
            />
          ))}
        </Box>
      )}

      {markers.length > 0 && trackPoints.length > 1 && (
        <Card sx={{ mt: 1.5, overflow: 'hidden' }}>
          <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
            <Stack direction="row" alignItems="center" gap={1}>
              <LocationOnRoundedIcon color="primary" />
              <Box>
                <Typography variant="h4">Medien auf der Strecke</Typography>
                <Typography variant="body2" color="text.secondary">{markers.length} verortete {markers.length === 1 ? 'Aufnahme' : 'Aufnahmen'}</Typography>
              </Box>
            </Stack>
          </CardContent>
          <TrackMap points={trackPoints} markers={markers} height={{ xs: 280, md: 340 }} variant={mapVariant} />
        </Card>
      )}

      <PhotoMetadataDialog
        mode="upload"
        open={uploadOpen}
        busy={upload.isPending}
        progress={uploadProgress}
        error={upload.error}
        config={mediaConfig.data?.video_formats ? mediaConfig.data : undefined}
        onClose={() => setUploadOpen(false)}
        onSubmit={(data) => upload.mutate(data as ActivityMediaUpload)}
      />
      <BulkPhotoUploadDialog
        activityId={activityId}
        open={bulkUploadOpen}
        onClose={() => setBulkUploadOpen(false)}
        onFinished={async () => {
          await refresh()
        }}
      />
      <PhotoMetadataDialog
        mode="edit"
        open={Boolean(editPhoto)}
        photo={editPhoto}
        busy={update.isPending}
        error={update.error}
        onClose={() => setEditPhoto(null)}
        onSubmit={(data) => editPhoto && update.mutate({ photoId: editPhoto.id, data: data as ActivityPhotoUpdate })}
      />

      <Dialog open={Boolean(deletePhoto)} onClose={remove.isPending ? undefined : () => setDeletePhoto(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Medium löschen?</DialogTitle>
        <DialogContent>
          <Typography>Das Medium{deletePhoto?.caption ? ` „${deletePhoto.caption}“` : ''} wird einschließlich aller abgeleiteten Dateien dauerhaft entfernt.</Typography>
          {remove.isError && <Alert severity="error" sx={{ mt: 2 }}>{errorMessage(remove.error)}</Alert>}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3 }}>
          <Button color="inherit" onClick={() => setDeletePhoto(null)}>Abbrechen</Button>
          <Button color="error" variant="contained" disabled={remove.isPending} onClick={() => deletePhoto && remove.mutate(deletePhoto.id)}>
            {remove.isPending ? 'Wird gelöscht …' : 'Medium löschen'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(detailPhoto)} onClose={() => setDetailPhoto(null)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ pr: 7 }}>{displayedDetailPhoto?.caption || (displayedDetailPhoto?.media_type === 'video' ? 'Aktivitätsvideo' : 'Aktivitätsfoto')}</DialogTitle>
        <IconButton aria-label="Ansicht schließen" onClick={() => setDetailPhoto(null)} sx={{ position: 'absolute', right: 12, top: 10 }}><CloseRoundedIcon /></IconButton>
        <DialogContent sx={{ pt: 0 }}>
          {displayedDetailPhoto && <AuthenticatedMedia media={displayedDetailPhoto} height="min(68vh, 720px)" contain />}
          {displayedDetailPhoto && <PhotoMeta photo={displayedDetailPhoto} sx={{ mt: 1.5 }} />}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3 }}>
          {displayedDetailPhoto?.media_type === 'video' && displayedDetailPhoto.processing_status === 'failed' && (
            <Button startIcon={<ReplayRoundedIcon />} disabled={retry.isPending} onClick={() => retry.mutate(displayedDetailPhoto.id)}>
              Erneut verarbeiten
            </Button>
          )}
          <Button startIcon={<EditRoundedIcon />} onClick={() => { setEditPhoto(displayedDetailPhoto); setDetailPhoto(null) }}>Metadaten bearbeiten</Button>
          <Button color="error" startIcon={<DeleteOutlineRoundedIcon />} onClick={() => { setDeletePhoto(displayedDetailPhoto); setDetailPhoto(null) }}>Löschen</Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

function MediaCard({ photo, onOpen, onEdit, onDelete }: { photo: ActivityMedia; onOpen: () => void; onEdit: () => void; onDelete: () => void }) {
  return (
    <Card sx={{ overflow: 'hidden' }}>
      <Box component="button" type="button" onClick={onOpen} sx={{ position: 'relative', display: 'block', width: '100%', p: 0, border: 0, cursor: 'zoom-in', bgcolor: 'action.hover' }}>
        <AuthenticatedMedia media={photo} height={230} preview />
        {photo.media_type === 'video' && photo.processing_status === 'ready' && (
          <PlayCircleOutlineRoundedIcon sx={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', color: 'common.white', fontSize: 58, filter: 'drop-shadow(0 2px 5px rgba(0,0,0,.55))' }} />
        )}
      </Box>
      <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
        <Stack direction="row" justifyContent="space-between" gap={1} alignItems="flex-start">
          <Box sx={{ minWidth: 0 }}>
            <Typography fontWeight={750} noWrap>{photo.caption || photo.original_filename}</Typography>
            <PhotoMeta photo={photo} />
          </Box>
          <Stack direction="row" sx={{ mt: -.75, mr: -.75 }}>
            <Tooltip title="Metadaten bearbeiten"><IconButton aria-label="Medienmetadaten bearbeiten" size="small" onClick={onEdit}><EditRoundedIcon fontSize="small" /></IconButton></Tooltip>
            <Tooltip title="Medium löschen"><IconButton aria-label="Medium löschen" size="small" color="error" onClick={onDelete}><DeleteOutlineRoundedIcon fontSize="small" /></IconButton></Tooltip>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  )
}

function AuthenticatedMedia({ media, height, contain = false, preview = false }: { media: ActivityMedia; height: number | string; contain?: boolean; preview?: boolean }) {
  const file = useQuery<Blob | string>({
    queryKey: ['activity-media-file', media.id, media.updated_at, preview],
    queryFn: () => preview
      ? activityMediaApi.poster(media)
      : media.media_type === 'video'
        ? activityMediaApi.playbackUrl(media)
        : activityMediaApi.file(media),
    enabled: media.media_type === 'image' || media.processing_status === 'ready',
    staleTime: 55 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
  })
  const poster = useQuery({
    queryKey: ['activity-media-poster', media.id, media.updated_at],
    queryFn: () => activityMediaApi.poster(media),
    enabled: media.media_type === 'video' && media.processing_status === 'ready' && !preview,
    staleTime: 55 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
  })
  const [source, setSource] = useState<string | null>(null)
  const [posterSource, setPosterSource] = useState<string | null>(null)
  useEffect(() => {
    if (!file.data) return
    if (typeof file.data === 'string') {
      setSource(file.data)
      return () => setSource(null)
    }
    const objectUrl = URL.createObjectURL(file.data)
    setSource(objectUrl)
    return () => {
      URL.revokeObjectURL(objectUrl)
      setSource(null)
    }
  }, [file.data])
  useEffect(() => {
    if (!poster.data) return
    const objectUrl = URL.createObjectURL(poster.data)
    setPosterSource(objectUrl)
    return () => {
      URL.revokeObjectURL(objectUrl)
      setPosterSource(null)
    }
  }, [poster.data])

  if (media.media_type === 'video' && media.processing_status !== 'ready') {
    const failed = media.processing_status === 'failed'
    return <Stack alignItems="center" justifyContent="center" spacing={1} sx={{ height, px: 2, color: failed ? 'error.main' : 'text.secondary' }}>
      {failed ? <ImageNotSupportedRoundedIcon /> : <VideoFileRoundedIcon />}
      <Typography variant="body2" fontWeight={700}>{failed ? 'Verarbeitung fehlgeschlagen' : 'Video wird verarbeitet …'}</Typography>
      {failed && media.processing_error && <Typography variant="caption" textAlign="center">{media.processing_error}</Typography>}
    </Stack>
  }
  if (file.isError) {
    return <Stack alignItems="center" justifyContent="center" spacing={1} sx={{ height, color: 'text.secondary' }}><ImageNotSupportedRoundedIcon /><Typography variant="caption">Medium nicht verfügbar</Typography></Stack>
  }
  if (!source) return <Skeleton variant="rectangular" height={height} />
  if (media.media_type === 'video' && !preview) {
    return <Box component="video" src={source} poster={posterSource ?? undefined} controls preload="metadata" sx={{ display: 'block', width: '100%', height, objectFit: 'contain', bgcolor: 'common.black' }} />
  }
  return <Box component="img" src={source} alt={media.caption || media.original_filename} sx={{ display: 'block', width: '100%', height, objectFit: contain ? 'contain' : 'cover', bgcolor: 'action.hover' }} />
}

function PhotoMeta({ photo, sx }: { photo: ActivityMedia; sx?: object }) {
  return (
    <Stack direction="row" gap={1.25} flexWrap="wrap" sx={{ mt: .5, ...sx }}>
      {photo.captured_at && <Stack direction="row" alignItems="center" gap={.4}><CalendarMonthRoundedIcon sx={{ fontSize: 15, color: 'text.secondary' }} /><Typography variant="caption" color="text.secondary">{formatDateTime(photo.captured_at)}</Typography></Stack>}
      {photo.latitude != null && photo.longitude != null && <Stack direction="row" alignItems="center" gap={.4}><LocationOnRoundedIcon sx={{ fontSize: 15, color: 'text.secondary' }} /><Typography variant="caption" color="text.secondary">{photo.latitude.toFixed(5)}, {photo.longitude.toFixed(5)}</Typography></Stack>}
      {photo.media_type === 'video' && photo.duration_s != null && <Typography variant="caption" color="text.secondary">{Math.floor(photo.duration_s / 60)}:{String(Math.round(photo.duration_s % 60)).padStart(2, '0')} · {photo.width}×{photo.height}</Typography>}
    </Stack>
  )
}

interface PhotoMetadataDialogProps {
  mode: 'upload' | 'edit'
  open: boolean
  photo?: ActivityMedia | null
  busy: boolean
  progress?: number
  error: unknown
  config?: ActivityMediaConfig
  onClose: () => void
  onSubmit: (data: ActivityMediaUpload | ActivityPhotoUpdate) => void
}

function PhotoMetadataDialog({ mode, open, photo, busy, progress = 0, error, config = defaultMediaConfig, onClose, onSubmit }: PhotoMetadataDialogProps) {
  const [file, setFile] = useState<File | null>(null)
  const [caption, setCaption] = useState('')
  const [capturedAt, setCapturedAt] = useState('')
  const [latitude, setLatitude] = useState('')
  const [longitude, setLongitude] = useState('')
  const [validation, setValidation] = useState<string | null>(null)
  const [videoDuration, setVideoDuration] = useState<number | null>(null)

  useEffect(() => {
    if (!open) return
    setFile(null)
    setCaption(photo?.caption ?? '')
    setCapturedAt(localDateTimeValue(photo?.captured_at))
    setLatitude(photo?.latitude == null ? '' : String(photo.latitude))
    setLongitude(photo?.longitude == null ? '' : String(photo.longitude))
    setValidation(null)
    setVideoDuration(null)
  }, [open, photo])

  useEffect(() => {
    if (!file || !isVideoFile(file)) {
      setVideoDuration(null)
      return
    }
    const source = URL.createObjectURL(file)
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.onloadedmetadata = () => {
      if (Number.isFinite(video.duration)) setVideoDuration(video.duration)
      URL.revokeObjectURL(source)
    }
    video.onerror = () => URL.revokeObjectURL(source)
    video.src = source
    return () => URL.revokeObjectURL(source)
  }, [file])

  function submit() {
    setValidation(null)
    if (mode === 'upload' && !file) return setValidation('Bitte wähle ein Foto oder Video aus.')
    if (file?.size === 0) return setValidation('Die Datei ist leer.')
    if (file && isVideoFile(file) && file.size > config.max_video_bytes) return setValidation(`Das Video darf höchstens ${Math.floor(config.max_video_bytes / 1024 / 1024)} MB groß sein.`)
    if (videoDuration != null && videoDuration > config.max_video_duration_seconds) return setValidation(`Das Video darf höchstens ${config.max_video_duration_seconds / 60} Minuten lang sein.`)
    if (file && !isVideoFile(file) && file.size > config.max_image_bytes) return setValidation(`Das Foto darf höchstens ${Math.floor(config.max_image_bytes / 1024 / 1024)} MB groß sein.`)
    if (caption.length > 1000) return setValidation('Die Caption darf höchstens 1.000 Zeichen lang sein.')
    if (Boolean(latitude) !== Boolean(longitude)) return setValidation('Bitte gib Breitengrad und Längengrad gemeinsam an.')
    const latitudeNumber = latitude ? Number(latitude) : null
    const longitudeNumber = longitude ? Number(longitude) : null
    if (latitudeNumber != null && (!Number.isFinite(latitudeNumber) || latitudeNumber < -90 || latitudeNumber > 90)) return setValidation('Der Breitengrad muss zwischen −90 und 90 liegen.')
    if (longitudeNumber != null && (!Number.isFinite(longitudeNumber) || longitudeNumber < -180 || longitudeNumber > 180)) return setValidation('Der Längengrad muss zwischen −180 und 180 liegen.')
    const metadata: ActivityPhotoUpdate = {
      caption: caption.trim() || null,
      captured_at: capturedAtForApi(capturedAt),
      latitude: latitudeNumber,
      longitude: longitudeNumber,
    }
    onSubmit(mode === 'upload' ? { ...metadata, file: file! } : metadata)
  }

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>{mode === 'upload' ? 'Foto oder Video hinzufügen' : 'Medienmetadaten bearbeiten'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {mode === 'upload' && (
            <Button component="label" variant={file ? 'outlined' : 'contained'} startIcon={<AddAPhotoRoundedIcon />}>
              {file ? file.name : 'Foto oder Video auswählen'}
              <Box component="input" hidden type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm,.mov" onChange={(event: React.ChangeEvent<HTMLInputElement>) => setFile(event.target.files?.[0] ?? null)} />
            </Button>
          )}
          {mode === 'upload' && <Typography variant="caption" color="text.secondary">Bilder: {config.image_formats.join(', ')} bis {Math.floor(config.max_image_bytes / 1024 / 1024)} MB. Videos: {config.video_formats.join(', ')} bis {Math.floor(config.max_video_bytes / 1024 / 1024)} MB und {config.max_video_duration_seconds / 60} Minuten. Der Server prüft den tatsächlichen Dateiinhalt.</Typography>}
          {mode === 'upload' && videoDuration != null && <Typography variant="caption" color="text.secondary">Erkannte Videodauer: {Math.ceil(videoDuration)} Sekunden</Typography>}
          <TextField label="Caption" value={caption} onChange={(event) => setCaption(event.target.value)} multiline minRows={2} inputProps={{ maxLength: 1000 }} helperText={`${caption.length}/1.000 Zeichen`} />
          <TextField label="Aufnahmezeit (optional)" type="datetime-local" value={capturedAt} onChange={(event) => setCapturedAt(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} helperText="Wird mit deiner lokalen Zeitzone gespeichert." />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
            <TextField label="Breitengrad (optional)" type="number" value={latitude} onChange={(event) => setLatitude(event.target.value)} inputProps={{ min: -90, max: 90, step: 'any' }} fullWidth />
            <TextField label="Längengrad (optional)" type="number" value={longitude} onChange={(event) => setLongitude(event.target.value)} inputProps={{ min: -180, max: 180, step: 'any' }} fullWidth />
          </Stack>
          {(validation || Boolean(error)) && <Alert severity="error">{validation ?? errorMessage(error)}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3 }}>
        <Button color="inherit" onClick={onClose}>Abbrechen</Button>
        <Button variant="contained" disabled={busy} onClick={submit}>{busy ? `${mode === 'upload' ? 'Wird hochgeladen' : 'Wird gespeichert'} … ${progress}%` : mode === 'upload' ? 'Medium hochladen' : 'Speichern'}</Button>
      </DialogActions>
    </Dialog>
  )
}

type BulkPhotoStatus = 'pending' | 'uploading' | 'success' | 'error'

interface BulkPhotoFile {
  id: string
  file: File
  status: BulkPhotoStatus
  progress: number
  error: string | null
  retryable: boolean
}

const bulkPhotoTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])
const bulkPhotoExtensions = /\.(jpe?g|png|webp)$/i

function bulkPhotoValidation(file: File) {
  if ((!file.type || !bulkPhotoTypes.has(file.type)) && !bulkPhotoExtensions.test(file.name)) {
    return 'Unterstützt werden JPEG-, PNG- und WebP-Bilder.'
  }
  if (file.size > defaultMediaConfig.max_image_bytes) return 'Das Foto darf höchstens 15 MB groß sein.'
  if (file.size === 0) return 'Die Datei ist leer.'
  return null
}

function BulkPhotoUploadDialog({
  activityId,
  open,
  onClose,
  onFinished,
}: {
  activityId: string
  open: boolean
  onClose: () => void
  onFinished: () => Promise<void>
}) {
  const [items, setItems] = useState<BulkPhotoFile[]>([])
  const [dragActive, setDragActive] = useState(false)
  const [running, setRunning] = useState(false)
  const [validation, setValidation] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setItems([])
      setDragActive(false)
      setRunning(false)
      setValidation(null)
    }
  }, [open])

  function addFiles(selected: File[]) {
    setValidation(null)
    const existing = new Set(items.map((item) => `${item.file.name}:${item.file.size}:${item.file.lastModified}`))
    const next = selected.map((file, index) => {
      const key = `${file.name}:${file.size}:${file.lastModified}`
      const error = bulkPhotoValidation(file)
      return {
        id: `${key}:${index}`,
        file,
        status: error ? 'error' as const : 'pending' as const,
        progress: 0,
        error,
        retryable: !error,
      }
    }).filter((item) => {
      const key = `${item.file.name}:${item.file.size}:${item.file.lastModified}`
      if (existing.has(key)) return false
      existing.add(key)
      return true
    })
    setItems((current) => [...current, ...next])
  }

  function removeItem(id: string) {
    if (running) return
    setItems((current) => current.filter((item) => item.id !== id))
  }

  async function uploadItems(ids: string[]) {
    if (running || ids.length === 0) return
    setRunning(true)
    const queue = [...ids]
    const worker = async () => {
      while (queue.length > 0) {
        const id = queue.shift()
        if (!id) return
        const item = items.find((candidate) => candidate.id === id)
        if (!item) continue
        setItems((current) => current.map((candidate) => candidate.id === id
          ? { ...candidate, status: 'uploading', progress: 0, error: null }
          : candidate))
        try {
          await activityPhotosApi.upload(activityId, { file: item.file }, (progress) => {
            setItems((current) => current.map((candidate) => candidate.id === id ? { ...candidate, progress } : candidate))
          })
          setItems((current) => current.map((candidate) => candidate.id === id
            ? { ...candidate, status: 'success', progress: 100, error: null }
            : candidate))
        } catch (error) {
          setItems((current) => current.map((candidate) => candidate.id === id
          ? { ...candidate, status: 'error', error: errorMessage(error) }
            : candidate))
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(3, ids.length) }, () => worker()))
    setRunning(false)
    await onFinished()
  }

  const pendingIds = items.filter((item) => item.status === 'pending').map((item) => item.id)
  const failedIds = items.filter((item) => item.status === 'error' && item.retryable).map((item) => item.id)
  const completed = items.filter((item) => item.status === 'success').length
  const totalProgress = items.length === 0
    ? 0
    : Math.round(items.reduce((sum, item) => sum + item.progress, 0) / items.length)

  return (
    <Dialog open={open} onClose={running ? undefined : onClose} fullWidth maxWidth="sm">
      {running && <LinearProgress variant="determinate" value={totalProgress} />}
      <DialogTitle>Mehrere Fotos hinzufügen</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Box
            component="label"
            role="button"
            tabIndex={0}
            onDragEnter={(event) => { event.preventDefault(); setDragActive(true) }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => { event.preventDefault(); setDragActive(false) }}
            onDrop={(event) => { event.preventDefault(); setDragActive(false); addFiles(Array.from(event.dataTransfer.files)) }}
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 130,
              p: 3,
              textAlign: 'center',
              border: '2px dashed',
              borderColor: dragActive ? 'primary.main' : 'divider',
              borderRadius: 2,
              bgcolor: dragActive ? 'action.selected' : 'action.hover',
              cursor: running ? 'default' : 'pointer',
            }}
          >
            <Stack alignItems="center" spacing={.75}>
              <CloudUploadRoundedIcon color="primary" fontSize="large" />
              <Typography fontWeight={700}>Bilder hierher ziehen</Typography>
              <Typography variant="body2" color="text.secondary">oder mehrere JPEG-, PNG- und WebP-Dateien auswählen</Typography>
            </Stack>
            <Box component="input" hidden type="file" multiple accept="image/jpeg,image/png,image/webp" disabled={running} onChange={(event: React.ChangeEvent<HTMLInputElement>) => addFiles(Array.from(event.target.files ?? []))} />
          </Box>

          {validation && <Alert severity="error">{validation}</Alert>}
          {items.length > 0 && (
            <>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography fontWeight={700}>{completed} von {items.length} Fotos hochgeladen</Typography>
                <Typography variant="body2" color="text.secondary">{totalProgress}%</Typography>
              </Stack>
              <LinearProgress variant="determinate" value={totalProgress} />
              <Divider />
              <List disablePadding>
                {items.map((item) => (
                  <ListItem key={item.id} disableGutters secondaryAction={
                    !running && <Button size="small" onClick={() => item.status === 'error' && item.retryable ? void uploadItems([item.id]) : removeItem(item.id)}>
                      {item.status === 'error' && item.retryable ? 'Erneut versuchen' : 'Entfernen'}
                    </Button>
                  }>
                    <ListItemText
                      primary={item.file.name}
                      secondary={item.error ?? (item.status === 'uploading' ? `Wird hochgeladen … ${item.progress}%` : item.status === 'success' ? 'Erfolgreich hochgeladen' : `${Math.ceil(item.file.size / 1024)} KB`)}
                      secondaryTypographyProps={{ color: item.status === 'error' ? 'error' : item.status === 'success' ? 'success.main' : 'text.secondary' }}
                    />
                  </ListItem>
                ))}
              </List>
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3 }}>
        <Button color="inherit" onClick={onClose} disabled={running}>Schließen</Button>
        <Button variant="contained" disabled={running || pendingIds.length === 0} onClick={() => void uploadItems(pendingIds)}>
          {running ? `Wird hochgeladen … ${totalProgress}%` : pendingIds.length > 0 ? `${pendingIds.length} Fotos hochladen` : failedIds.length > 0 ? 'Fehlgeschlagene Fotos erneut versuchen' : 'Fertig'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
