import { Box, Typography } from '@mui/material'

export function Brand({ inverse = false, compact = false }: { inverse?: boolean; compact?: boolean }) {
  return (
    <Box
      aria-label="Baseline Cycling"
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.25,
        color: inverse ? '#f2f5ef' : 'text.primary',
      }}
    >
      <Box
        component="svg"
        viewBox="0 0 512 512"
        role="img"
        aria-hidden="true"
        sx={{
          width: 42,
          height: 42,
          flex: '0 0 auto',
          borderRadius: '12px',
          bgcolor: '#080a0d',
          boxShadow: 'inset 0 0 0 1px rgba(242,245,239,.12)',
        }}
      >
        <path fill="#f2f5ef" d="M102 124h176c65 0 118 53 118 118 0 29-10 55-27 76l-42-30c9-13 14-29 14-46 0-36-29-65-65-65H102v-53Z" />
        <path fill="#f2f5ef" d="M102 337h296c8 16 12 33 12 51H102v-51Z" />
        <g fill="none" stroke="#b9e878" strokeLinecap="round" strokeLinejoin="round" strokeWidth="8">
          <circle cx="218" cy="288" r="24" />
          <circle cx="306" cy="288" r="24" />
          <path d="m218 288 30-48 30 48h-60Zm30-48 45 3 13 45m-58-48-8-18h18m20 66 16-45m-8-11h18" />
        </g>
        <circle cx="271" cy="211" r="10" fill="#b9e878" />
      </Box>
      {!compact && (
        <Box component="span" sx={{ display: 'grid', lineHeight: 1 }}>
          <Typography component="span" sx={{ fontSize: '1.04rem', fontWeight: 650, letterSpacing: '-.045em', lineHeight: 1 }}>
            Baseline
          </Typography>
          <Typography component="span" sx={{ mt: .55, color: inverse ? '#b9e878' : 'primary.main', fontSize: '.52rem', fontWeight: 800, letterSpacing: '.22em', lineHeight: 1 }}>
            CYCLING
          </Typography>
        </Box>
      )}
    </Box>
  )
}
