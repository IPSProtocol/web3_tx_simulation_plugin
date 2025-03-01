import React from 'react';
import {
  Box,
  Typography,
  Chip,
  Tooltip,
  IconButton,
  Collapse,
  TableRow,
  TableCell,
  Stack,
} from '@mui/material';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowRightAltIcon from '@mui/icons-material/ArrowRightAlt';
import { EventContext } from '../../types/transaction';
import { ParameterList } from './ParameterList';
import ethIcon from '../../assets/images/eth-icon.png';
import btcIcon from '../../assets/images/btc-icon.png';
import { shortenAddress } from '../../utils/address';
import { formatUnits } from 'ethers';

// Helper to format token amounts (assuming 18 decimals)
const formatTokenAmount = (amount: string) => {
  const value = BigInt(amount);
  const divisor = BigInt(10 ** 18);
  const integerPart = value / divisor;
  const decimalPart = value % divisor;
  const decimalStr = decimalPart.toString().padStart(18, '0').slice(0, 4);
  return `${integerPart}.${decimalStr}`;
};

// Mock function to get token icon based on address or name
const getTokenIcon = (tokenName?: string) => {
  if (tokenName?.toLowerCase().includes('eth')) return ethIcon;
  if (tokenName?.toLowerCase().includes('btc')) return btcIcon;
  return ethIcon; // Default to ETH icon
};

interface EventParameter {
  name: string;
  value: string;
  type: string;
}

interface SwapEventRowProps {
  event: EventContext;
  tokenName: string;
}

const formatAmount = (amount: string): string => {
  try {
    return formatUnits(amount, 18);
  } catch {
    return amount;
  }
};

const SwapEventRow: React.FC<SwapEventRowProps> = ({ event, tokenName }) => {
  const [open, setOpen] = React.useState(false);

  const sender = event.parameters.find(p => p.name === 'sender')?.value;
  const recipient = event.parameters.find(p => p.name === 'recipient')?.value;
  const amount0In = event.parameters.find(p => p.name === 'amount0In')?.value;
  const amount1In = event.parameters.find(p => p.name === 'amount1In')?.value;
  const amount0Out = event.parameters.find(p => p.name === 'amount0Out')?.value;
  const amount1Out = event.parameters.find(p => p.name === 'amount1Out')?.value;

  if (!sender || !recipient) {
    return null;
  }

  return (
    <Box sx={{ 
      width: '100%',
      backgroundColor: 'background.paper',
      borderRadius: 2,
      my: 1,
      boxShadow: '0 0 0 1px rgba(0, 0, 0, 0.05), 0 1px 3px rgba(0, 0, 0, 0.1)',
      transition: 'all 0.2s ease-in-out',
      '&:hover': {
        boxShadow: '0 0 0 1px rgba(0, 0, 0, 0.05), 0 3px 6px rgba(0, 0, 0, 0.15)',
        transform: 'translateY(-1px)'
      }
    }}>
      <Stack 
        direction="row" 
        alignItems="center" 
        spacing={4}
        sx={{ 
          minHeight: 72,
          px: 3,
          py: 2
        }}
      >
        <Stack direction="row" alignItems="center" spacing={2} sx={{ width: 200, ml: 2 }}>
          <IconButton size="small" onClick={() => setOpen(!open)}>
            {open ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
          </IconButton>
          <Typography variant="body1" fontWeight="medium">
            Swap
          </Typography>
        </Stack>

        <Stack 
          direction="row" 
          spacing={6} 
          alignItems="center" 
          justifyContent="center"
          sx={{ flex: 1, mx: 4 }}
        >
          <Stack alignItems="flex-end" spacing={1} sx={{ minWidth: 120 }}>
            <Box
              component="img"
              src={getTokenIcon(tokenName)}
              alt={tokenName}
              sx={{ width: 24, height: 24, objectFit: 'contain' }}
            />
            <Typography variant="body2" color="text.secondary">
              {formatAmount(amount0In || '')} {tokenName}
            </Typography>
          </Stack>

          <Stack alignItems="center" spacing={1} sx={{ px: 3 }}>
            <ArrowRightAltIcon color="action" />
            <ArrowRightAltIcon color="action" sx={{ transform: 'rotate(180deg)' }} />
          </Stack>

          <Stack alignItems="flex-start" spacing={1} sx={{ minWidth: 120 }}>
            <Box
              component="img"
              src={getTokenIcon('ETH')}
              alt="Token1"
              sx={{ width: 24, height: 24, objectFit: 'contain' }}
            />
            <Typography variant="body2" color="text.secondary">
              {formatAmount(amount1Out || '')} ETH
            </Typography>
          </Stack>
        </Stack>
      </Stack>

      <Collapse in={open} timeout="auto" unmountOnExit>
        <Box sx={{ p: 3, borderTop: '1px solid rgba(0, 0, 0, 0.05)' }}>
          <Typography variant="h6" gutterBottom component="div">
            Parameters
          </Typography>
          <ParameterList parameters={event.parameters} />
        </Box>
      </Collapse>
    </Box>
  );
};

export default SwapEventRow; 