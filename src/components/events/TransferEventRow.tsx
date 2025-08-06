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
import ArrowRightAltIcon from '@mui/icons-material/ArrowRightAlt';
import { EventContext as EventContextType } from '../../types/simulation_interfaces';
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

import { EventParameter } from 'types/simulation_interfaces';

interface EventContext {
  eventName: string;
  parameters: EventParameter[];
  contractAddress: string;
  blockNumber: number;
  transactionHash: string;
}

interface TransferEventRowProps {
  event: EventContextType;
  tokenName: string;
}

const formatAmount = (amount: string): string => {
  try {
    return formatUnits(amount, 18);
  } catch {
    return amount;
  }
};

const TransferEventRow: React.FC<TransferEventRowProps> = ({ event, tokenName }) => {
  const [open, setOpen] = React.useState(false);

  const from = event.parameters.find(p  => p.name === 'from')?.value;
  const to = event.parameters.find(p => p.name === 'to')?.value;
  const value = event.parameters.find(p => p.name === 'value')?.value;

  if (!from || !to || !value) {
    return null;
  }

  const formattedAmount = formatAmount(value);

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
          <Box
            component="img"
            src={getTokenIcon(tokenName)}
            alt={tokenName}
            sx={{ width: 24, height: 24, objectFit: 'contain' }}
          />
          <Typography variant="body1" fontWeight="medium">
            Transfer
          </Typography>
        </Stack>

        <Stack 
          direction="row" 
          spacing={6} 
          alignItems="center" 
          justifyContent="center"
          sx={{ flex: 1, mx: 4 }}
        >
          <Stack alignItems="flex-end" sx={{ minWidth: 120 }}>
            <Tooltip title={from}>
              <Typography variant="body2">{shortenAddress(from)}</Typography>
            </Tooltip>
            <Typography variant="body2" color="error.main">
              -{formattedAmount} {tokenName}
            </Typography>
          </Stack>

          <Stack alignItems="center" spacing={1} sx={{ px: 3 }}>
            <Typography variant="caption" color="text.secondary">
              Transfer To
            </Typography>
            <ArrowRightAltIcon color="action" />
          </Stack>

          <Stack alignItems="flex-start" sx={{ minWidth: 120 }}>
            <Tooltip title={to}>
              <Typography variant="body2">{shortenAddress(to)}</Typography>
            </Tooltip>
            <Typography variant="body2" color="success.main">
              +{formattedAmount} {tokenName}
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

export default TransferEventRow; 