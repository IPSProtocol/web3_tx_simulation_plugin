import React, { useEffect, useRef, useState } from 'react';
import {
  Box,
  Typography,
  Button,
  Stack,
  Paper,
  IconButton,
  Tooltip,
  Divider,
  Chip
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CloseIcon from '@mui/icons-material/Close';
import RefreshIcon from '@mui/icons-material/Refresh';
import { QuarantineResponse } from '../types/quarantine';
import { shortenAddress } from '../utils/address';

type Props = { response: QuarantineResponse; mismatchCanonicalId?: string | null; onClose?: () => void; onRetry?: () => void };

type ImpactEstimate = { success?: boolean; eth: string; weth: string; wbtc: string; feth: string; approxEth: string; error?: string };

export default function QuarantineResultView({ response, mismatchCanonicalId, onClose, onRetry }: Props) {
  const hdrRef = useRef<HTMLDivElement>(null);
  const [impact, setImpact] = useState<ImpactEstimate | null>(null);

  // Intentionally do not focus the header to avoid showing a blue focus outline

  useEffect(() => {
    (async () => {
      try {
        const resp = await chrome.runtime.sendMessage({ type: 'GET_IMPACT_ESTIMATE' });
        if (resp?.success) setImpact(resp as ImpactEstimate);
      } catch { }
    })();
  }, []);

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(response.canonicalId);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  return (
    <Box
      sx={{
        minHeight: '420px',
        width: '100%',
        p: 4,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'grey.100',
      }}
    >
      <Paper
        elevation={3}
        sx={{
          width: 500,
          maxWidth: 500,
          mx: 'auto',
          borderRadius: 3,
          p: 4,
          backgroundColor: 'background.paper',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
          transition: 'all 0.2s ease-in-out',
          '&:hover': {
            boxShadow: '0 12px 40px rgba(0, 0, 0, 0.15)',
          }
        }}
      >
        {/* Header */}
        <Stack
          ref={hdrRef}
          tabIndex={-1}
          direction="row"
          alignItems="center"
          spacing={3}
          sx={{ mb: 3, outline: 'none', '&:focus': { outline: 'none' } }}
          aria-live="polite"
        >
          <Stack spacing={0.5} sx={{ flex: 1 }}>
            <Typography variant="h5" fontWeight="bold" sx={{ color: 'success.main' }}>
              IntentGuard Protected Transaction!
            </Typography>

          </Stack>
        </Stack>

        {/* Impact line */}
        <Paper
          variant="outlined"
          sx={{ p: 2, mb: 2, borderRadius: 2 }}
        >
          <Typography variant="body2" sx={{ fontWeight: 'bold', mb: 1 }}>
            Simulation mismatch. The on-chain result differed from what you approved.
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 'bold', mb: 1 }}>
            Estimated loss avoided:
          </Typography>
          <Stack spacing={1}>
            <Stack direction="row" spacing={1} alignItems="center">
              <Chip size="small" label={`- ${impact?.weth ?? '0'}`} sx={{ bgcolor: 'error.main', color: 'common.white', fontWeight: 700 }} />
              <Typography variant="body2" sx={{ fontWeight: 'bold' }}>WETH</Typography>
            </Stack>
            <Stack direction="row" spacing={1} alignItems="center">
              <Chip size="small" label={`- ${impact?.wbtc ?? '0'}`} sx={{ bgcolor: 'error.main', color: 'common.white', fontWeight: 700 }} />
              <Typography variant="body2" sx={{ fontWeight: 'bold' }}>WBTC</Typography>
            </Stack>
            <Stack direction="row" spacing={1} alignItems="center">
              <Chip size="small" label={`- ${impact?.feth ?? '0'}`} sx={{ bgcolor: 'error.main', color: 'common.white', fontWeight: 700 }} />
              <Typography variant="body2" sx={{ fontWeight: 'bold' }}>FETH</Typography>
            </Stack>
          </Stack>
        </Paper>

        {/* Reason section */}
        {response.status === 'quarantined' && (
          <Paper
            variant="outlined"
            sx={{
              p: 3,
              mb: 3,
              borderRadius: 2,
              backgroundColor: 'grey.50',
            }}
          >
            <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 'bold' }}>
              Reason
            </Typography>
            <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
              Wallet draining detected.
            </Typography>
          </Paper>
        )}

        {/* Mismatch warning */}
        {mismatchCanonicalId && (
          <Box
            sx={{
              mb: 3,
              p: 2,
              backgroundColor: 'warning.light',
              borderRadius: 1,
              border: '1px solid',
              borderColor: 'warning.main',
            }}
          >
            <Typography variant="caption" sx={{ color: 'warning.dark' }}>
              Showing result for a different transaction than currently in view.
            </Typography>
          </Box>
        )}

        {/* Canonical ID section */}
        <Paper
          variant="outlined"
          sx={{
            p: 3,
            mb: 3,
            borderRadius: 2,
            backgroundColor: 'grey.50',
            transition: 'all 0.2s ease-in-out',
            '&:hover': {
              backgroundColor: 'grey.100',
            }
          }}
        >
          <Typography variant="subtitle2" gutterBottom fontWeight="medium">
            Canonical ID
          </Typography>
          <Stack direction="row" alignItems="center" spacing={2}>
            <Typography
              variant="body2"
              component="code"
              sx={{
                flex: 1,
                wordBreak: 'break-all',
                fontFamily: 'monospace',
                fontSize: '0.75rem',
                backgroundColor: 'background.paper',
                p: 1.5,
                borderRadius: 1,
                border: '1px solid',
                borderColor: 'divider',
              }}
            >
              {shortenAddress(response.canonicalId)}
            </Typography>
            <Tooltip title="Copy to clipboard">
              <IconButton
                size="small"
                onClick={copyId}
                sx={{
                  '&:hover': {
                    backgroundColor: 'primary.light',
                    color: 'primary.contrastText',
                  }
                }}
              >
                <ContentCopyIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        </Paper>



        <Divider sx={{ mb: 3 }} />

        {/* Action buttons */}
        <Stack
          direction="row"
          spacing={2}
          justifyContent="center"
          sx={{
            '& .MuiButton-root': {
              borderRadius: 2,
              px: 3,
              py: 1,
              transition: 'all 0.2s ease-in-out',
            }
          }}
        >
          {response.status === 'unknown' && (
            <Button
              variant="outlined"
              startIcon={<RefreshIcon />}
              onClick={onRetry}
              color="info"
            >
              Retry
            </Button>
          )}
          <Button
            variant="contained"
            startIcon={<CloseIcon />}
            onClick={onClose}
            size="large"
            sx={{
              minWidth: 120,
              '&:hover': {
                transform: 'translateY(-1px)',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
              }
            }}
          >
            Close
          </Button>
        </Stack>
      </Paper>
    </Box>
  );
};