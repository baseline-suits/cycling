import ArrowDownwardRoundedIcon from '@mui/icons-material/ArrowDownwardRounded'
import ArrowUpwardRoundedIcon from '@mui/icons-material/ArrowUpwardRounded'
import { alpha, Box, Card, CardContent, Chip, Stack, Typography } from '@mui/material'

export function MetricCard({
  label,
  value,
  icon,
  accent = '#5E7F1C',
  delta,
  hint,
}: {
  label: string
  value: string
  icon: React.ReactNode
  accent?: string
  delta?: number | null
  hint?: string
}) {
  return (
    <Card sx={{ height: '100%', position: 'relative', overflow: 'hidden', '&::after': { content: '""', position: 'absolute', inset: 'auto 0 0', height: 3, bgcolor: accent, opacity: .8 } }}>
      <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
          <Box>
            <Typography variant="body2" color="text.secondary" fontWeight={650}>{label}</Typography>
            <Typography variant="h3" sx={{ mt: 1, fontSize: { xs: '1.3rem', sm: '1.65rem' }, lineHeight: 1.15 }}>{value}</Typography>
          </Box>
          <Box sx={{ width: 44, height: 44, borderRadius: 3, display: 'grid', placeItems: 'center', color: accent, bgcolor: alpha(accent, .1) }}>
            {icon}
          </Box>
        </Stack>
        {(delta != null || hint) && (
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 2 }}>
            {delta != null && (
              <Chip
                size="small"
                icon={delta >= 0 ? <ArrowUpwardRoundedIcon /> : <ArrowDownwardRoundedIcon />}
                label={`${delta >= 0 ? '+' : '−'}${Math.abs(delta).toLocaleString('de-DE', { maximumFractionDigits: 0 })} %`}
                sx={{ bgcolor: delta >= 0 ? 'rgba(50,160,90,.12)' : 'rgba(220,90,80,.1)', color: delta >= 0 ? 'success.main' : 'error.main' }}
              />
            )}
            {hint && <Typography variant="caption" color="text.secondary">{hint}</Typography>}
          </Stack>
        )}
      </CardContent>
    </Card>
  )
}
