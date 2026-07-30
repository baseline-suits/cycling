import { useDeferredValue, useState } from 'react'
import AddRoundedIcon from '@mui/icons-material/AddRounded'
import ClearAllRoundedIcon from '@mui/icons-material/ClearAllRounded'
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded'
import SearchRoundedIcon from '@mui/icons-material/SearchRounded'
import {
  Box,
  Alert,
  Button,
  Checkbox,
  FormControlLabel,
  InputAdornment,
  MenuItem,
  Pagination,
  Skeleton,
  Stack,
  TextField,
} from '@mui/material'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useOutletContext } from 'react-router-dom'
import { activitiesApi } from '../api'
import { ActivityCard } from '../components/ActivityCard'
import { EmptyState, ErrorState } from '../components/States'
import { PageHeader } from '../components/PageHeader'
import type { ShellOutletContext } from '../layout/AppShell'
import { activityTypes } from '../utils/format'

const pageSize = 12

export function ActivitiesPage() {
  const { openImport } = useOutletContext<ShellOutletContext>()
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)
  const [type, setType] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<string[]>([])
  const [redactExport, setRedactExport] = useState(false)
  const filters = { q: deferredSearch.trim() || undefined, type: type || undefined, date_from: dateFrom || undefined, date_to: dateTo || undefined, limit: pageSize, offset: (page - 1) * pageSize }
  const query = useQuery({
    queryKey: ['activities', filters],
    queryFn: () => activitiesApi.list(filters),
  })
  const hasFilters = Boolean(search || type || dateFrom || dateTo)
  const exportMutation = useMutation({
    mutationFn: () => activitiesApi.export({ activity_ids: selected, include_original: !redactExport, redact_private_data: redactExport }),
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'baseline-cycling-export.zip'
      link.click()
      URL.revokeObjectURL(url)
    },
  })

  function reset() {
    setSearch('')
    setType('')
    setDateFrom('')
    setDateTo('')
    setPage(1)
  }

  function toggleSelection(id: string) {
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  }

  return (
    <>
      <PageHeader
        eyebrow="DEIN ARCHIV"
        title="Aktivitäten"
        description={query.data ? `${query.data.total.toLocaleString('de-DE')} Fahrten in deinem Baseline Cycling.` : 'Suche, filtere und öffne deine importierten Radfahrten.'}
        action={<Stack direction="row" gap={1} flexWrap="wrap" justifyContent="flex-end"><Button variant="outlined" startIcon={<DownloadRoundedIcon />} disabled={!selected.length || exportMutation.isPending} onClick={() => exportMutation.mutate()}>{exportMutation.isPending ? 'Export läuft …' : `Export${selected.length ? ` (${selected.length})` : ''}`}</Button><Button variant="contained" startIcon={<AddRoundedIcon />} onClick={openImport}>Importieren</Button></Stack>}
      />
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'minmax(240px, 1fr) 180px 170px 170px auto' }, gap: 1.25, mb: 3 }}>
        <TextField
          placeholder="Titel oder Dateiname suchen"
          value={search}
          onChange={(event) => { setSearch(event.target.value); setPage(1) }}
          slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchRoundedIcon /></InputAdornment> } }}
        />
        <TextField select label="Typ" value={type} onChange={(event) => { setType(event.target.value); setPage(1) }}>
          <MenuItem value="">Alle Typen</MenuItem>
          {activityTypes.map((item) => <MenuItem key={item.value} value={item.value}>{item.label}</MenuItem>)}
        </TextField>
        <TextField label="Von" type="date" value={dateFrom} onChange={(event) => { setDateFrom(event.target.value); setPage(1) }} slotProps={{ inputLabel: { shrink: true } }} />
        <TextField label="Bis" type="date" value={dateTo} onChange={(event) => { setDateTo(event.target.value); setPage(1) }} slotProps={{ inputLabel: { shrink: true } }} />
        {hasFilters && <Button color="inherit" startIcon={<ClearAllRoundedIcon />} onClick={reset}>Zurücksetzen</Button>}
      </Box>
      <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ xs: 'flex-start', sm: 'center' }} justifyContent="space-between" gap={1} sx={{ mb: 2 }}>
        <FormControlLabel control={<Checkbox checked={query.data ? query.data.items.length > 0 && query.data.items.every((item) => selected.includes(item.id)) : false} onChange={(_, checked) => setSelected((current) => checked ? Array.from(new Set([...current, ...(query.data?.items ?? []).map((item) => item.id)])) : current.filter((id) => !(query.data?.items ?? []).some((item) => item.id === id)))} />} label="Aktuelle Seite auswählen" />
        <FormControlLabel control={<Checkbox checked={redactExport} onChange={(_, checked) => setRedactExport(checked)} />} label="Privatdaten im Export redigieren" />
      </Stack>
      {exportMutation.isError && <Alert severity="error" sx={{ mb: 2 }}>Der Export konnte nicht erstellt werden.</Alert>}

      {query.isError && <ErrorState error={query.error} onRetry={() => void query.refetch()} />}
      {query.isLoading && (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: '1fr 1fr' }, gap: 2 }}>
          {Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} variant="rounded" height={165} />)}
        </Box>
      )}
      {query.data && query.data.items.length > 0 && (
        <>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: '1fr 1fr' }, gap: 2 }}>
            {query.data.items.map((activity) => <ActivityCard key={activity.id} activity={activity} selected={selected.includes(activity.id)} onSelect={(item) => toggleSelection(item.id)} />)}
          </Box>
          {query.data.total > pageSize && (
            <Stack alignItems="center" sx={{ mt: 4 }}>
              <Pagination
                page={page}
                count={Math.ceil(query.data.total / pageSize)}
                color="primary"
                onChange={(_, value) => { setPage(value); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
              />
            </Stack>
          )}
        </>
      )}
      {query.data && query.data.items.length === 0 && (
        <EmptyState
          title={hasFilters ? 'Keine Treffer' : 'Noch keine Aktivitäten'}
          description={hasFilters ? 'Passe deine Suche oder den Zeitraum an.' : 'Importiere deine erste TCX-Datei und Baseline Cycling übernimmt den Rest.'}
          action={hasFilters ? <Button onClick={reset}>Filter zurücksetzen</Button> : <Button variant="contained" onClick={openImport}>Erste Aktivität importieren</Button>}
        />
      )}
    </>
  )
}
