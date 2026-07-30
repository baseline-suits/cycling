import BuildRoundedIcon from '@mui/icons-material/BuildRounded'
import CalendarMonthRoundedIcon from '@mui/icons-material/CalendarMonthRounded'
import DataObjectRoundedIcon from '@mui/icons-material/DataObjectRounded'
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded'
import FactCheckRoundedIcon from '@mui/icons-material/FactCheckRounded'
import RouteRoundedIcon from '@mui/icons-material/RouteRounded'
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded'
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Chip,
  Divider,
  Stack,
  Typography,
} from '@mui/material'
import { Link as RouterLink } from 'react-router-dom'
import type { AIActivitySource, AIDataBasis } from '../api'
import { formatDate, formatDateTime } from '../utils/format'

function displayValue(value: unknown): string {
  if (value == null) return '–'
  if (typeof value === 'boolean') return value ? 'Ja' : 'Nein'
  if (typeof value === 'number') return value.toLocaleString('de-DE', { maximumFractionDigits: 2 })
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map(displayValue).join(', ')
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function periodLabel(dataBasis: AIDataBasis) {
  const period = dataBasis.period
  if (!period) return null
  if (period.label) return period.label
  if (period.started_at && period.ended_at) {
    return `${formatDate(period.started_at)} – ${formatDate(period.ended_at)}`
  }
  if (period.started_at) return `ab ${formatDate(period.started_at)}`
  if (period.ended_at) return `bis ${formatDate(period.ended_at)}`
  return null
}

export interface AIDataBasisPanelProps {
  dataBasis?: AIDataBasis | null
  sources?: AIActivitySource[]
  tools?: string[]
  toolLabels?: Record<string, string>
  provider?: string | null
  title?: string
  defaultExpanded?: boolean
}

export function AIDataBasisPanel({
  dataBasis,
  sources = [],
  tools = [],
  toolLabels = {},
  provider,
  title = 'So kam die Antwort zustande',
  defaultExpanded = false,
}: AIDataBasisPanelProps) {
  const sourcesById = new Map(sources.map((source) => [source.activity_id, source]))
  const activityIds = Array.from(new Set([
    ...sources.map((source) => source.activity_id),
    ...(dataBasis?.activity_ids ?? []),
  ]))
  const facts = Object.entries(dataBasis?.facts ?? {})
  const period = dataBasis ? periodLabel(dataBasis) : null
  const detailCount = activityIds.length + tools.length + (dataBasis?.metrics.length ?? 0) + facts.length

  return (
    <Accordion
      disableGutters
      defaultExpanded={defaultExpanded}
      sx={{
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: '14px !important',
        bgcolor: 'rgba(var(--mui-palette-background-paperChannel) / .72)',
        boxShadow: 'none',
        overflow: 'hidden',
        '&::before': { display: 'none' },
      }}
    >
      <AccordionSummary expandIcon={<ExpandMoreRoundedIcon />} aria-label={`${title} einblenden`}>
        <Stack direction="row" alignItems="center" gap={1} sx={{ minWidth: 0 }}>
          <FactCheckRoundedIcon color="primary" fontSize="small" />
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="body2" fontWeight={750}>{title}</Typography>
            <Typography variant="caption" color="text.secondary">
              {period ?? `${detailCount} dokumentierte Details`}
            </Typography>
          </Box>
        </Stack>
      </AccordionSummary>
      <AccordionDetails sx={{ pt: 0 }}>
        <Stack spacing={2}>
          {(period || provider || dataBasis?.generated_at) && (
            <Stack direction="row" gap={.75} flexWrap="wrap">
              {period && <Chip size="small" icon={<CalendarMonthRoundedIcon />} label={period} />}
              {provider && <Chip size="small" variant="outlined" label={`Erstellt mit ${provider}`} />}
              {dataBasis?.generated_at && (
                <Chip size="small" variant="outlined" label={`Datenstand ${formatDateTime(dataBasis.generated_at)}`} />
              )}
            </Stack>
          )}

          {activityIds.length > 0 && (
            <TransparencySection icon={<RouteRoundedIcon />} title="Verwendete Aktivitäten">
              <Stack direction="row" gap={.75} flexWrap="wrap">
                {activityIds.map((activityId) => {
                  const source = sourcesById.get(activityId)
                  return (
                    <Chip
                      key={activityId}
                      size="small"
                      clickable
                      component={RouterLink}
                      to={`/aktivitaeten/${activityId}`}
                      label={source ? `${source.title} · ${formatDate(source.started_at)}` : `Aktivität ${activityId.slice(0, 8)}`}
                    />
                  )
                })}
              </Stack>
            </TransparencySection>
          )}

          {(facts.length > 0 || Boolean(dataBasis?.metrics.length)) && (
            <TransparencySection icon={<DataObjectRoundedIcon />} title="Strukturierte Fakten">
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 1 }}>
                {dataBasis?.metrics.map((metric, index) => (
                  <FactRow
                    key={`${metric.name}-${metric.activity_id ?? 'all'}-${index}`}
                    label={metric.name}
                    value={`${displayValue(metric.value)}${metric.unit ? ` ${metric.unit}` : ''}`}
                    hint={`${metric.source} · ${metric.method}`}
                  />
                ))}
                {facts.map(([key, value]) => <FactRow key={key} label={key.replaceAll('_', ' ')} value={displayValue(value)} />)}
              </Box>
            </TransparencySection>
          )}

          {(tools.length > 0 || Boolean(dataBasis?.methods.length)) && (
            <TransparencySection icon={<BuildRoundedIcon />} title="Werkzeuge und Methoden">
              <Stack spacing={1}>
                {tools.length > 0 && (
                  <Stack direction="row" gap={.75} flexWrap="wrap">
                    {tools.map((tool) => (
                      <Chip key={tool} variant="outlined" size="small" label={toolLabels[tool] ?? tool.replaceAll('_', ' ')} />
                    ))}
                  </Stack>
                )}
                {dataBasis?.methods.map((method, index) => (
                  <Box key={`${method.name}-${index}`}>
                    <Typography variant="body2" fontWeight={750}>{method.name}</Typography>
                    <Typography variant="caption" color="text.secondary">{method.description}</Typography>
                    {Object.keys(method.parameters).length > 0 && (
                      <Typography variant="caption" color="text.secondary" display="block">
                        {Object.entries(method.parameters).map(([key, value]) => `${key}: ${displayValue(value)}`).join(' · ')}
                      </Typography>
                    )}
                  </Box>
                ))}
              </Stack>
            </TransparencySection>
          )}

          {Boolean(dataBasis?.limitations.length) && (
            <TransparencySection icon={<WarningAmberRoundedIcon />} title="Einschränkungen">
              <Stack spacing={.5}>
                {dataBasis?.limitations.map((limitation, index) => (
                  <Typography key={`${limitation}-${index}`} variant="body2" color="text.secondary">• {limitation}</Typography>
                ))}
              </Stack>
            </TransparencySection>
          )}

          {!dataBasis && activityIds.length === 0 && tools.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              Für diese Antwort wurde keine strukturierte Datengrundlage geliefert.
            </Typography>
          )}

          {dataBasis && (
            <Typography variant="caption" color="text.secondary">
              Transparenzschema {dataBasis.schema_version}
              {dataBasis.period?.timezone ? ` · Zeitzone ${dataBasis.period.timezone}` : ''}
            </Typography>
          )}
        </Stack>
      </AccordionDetails>
    </Accordion>
  )
}

function TransparencySection({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <Box>
      <Stack direction="row" alignItems="center" gap={.75} sx={{ mb: 1 }}>
        <Box sx={{ color: 'text.secondary', display: 'grid', placeItems: 'center', '& svg': { fontSize: 17 } }}>{icon}</Box>
        <Typography variant="caption" color="text.secondary" fontWeight={800} sx={{ letterSpacing: '.04em', textTransform: 'uppercase' }}>{title}</Typography>
      </Stack>
      {children}
      <Divider sx={{ mt: 2, '&:last-child': { display: 'none' } }} />
    </Box>
  )
}

function FactRow({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Box sx={{ p: 1.25, borderRadius: 2.5, bgcolor: 'action.hover', minWidth: 0 }}>
      <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'capitalize' }}>{label}</Typography>
      <Typography variant="body2" fontWeight={750} sx={{ overflowWrap: 'anywhere' }}>{value}</Typography>
      {hint && <Typography variant="caption" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>{hint}</Typography>}
    </Box>
  )
}
