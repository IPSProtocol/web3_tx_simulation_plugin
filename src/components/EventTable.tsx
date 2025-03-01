import React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Tooltip,
  IconButton,
  Collapse,
  Box,
  Typography,
  Stack
} from '@mui/material';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import { EventContext } from '../types/transaction';
import TransferEventRow from './events/TransferEventRow';
import { ApprovalEventRow } from './events/ApprovalEventRow';
import SwapEventRow from './events/SwapEventRow';
import { ParameterList } from './events/ParameterList';
import { shortenAddress } from '../utils/address';

// Helper function to shorten addresses
const getTokenName = (address: string): string => {
  // TODO: Implement token name lookup
  return shortenAddress(address);
};

// Default row component for non-specialized events
const DefaultEventRow: React.FC<{ event: EventContext }> = ({ event }) => {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <TableRow sx={{ '& > *': { borderBottom: 'unset' } }}>
        <TableCell>
          <IconButton
            size="small"
            onClick={() => setOpen(!open)}
          >
            {open ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
          </IconButton>
        </TableCell>
        <TableCell component="th" scope="row">
          <Typography variant="body1" fontWeight="medium">
            {event.eventName}
          </Typography>
        </TableCell>
        <TableCell>
          <Tooltip title={event.caller}>
            <Chip
              label={shortenAddress(event.caller)}
              size="small"
              color="primary"
              variant="outlined"
            />
          </Tooltip>
        </TableCell>
        <TableCell>
          <Tooltip title={event.contractAddress}>
            <Chip
              label={shortenAddress(event.contractAddress)}
              size="small"
              color="secondary"
              variant="outlined"
            />
          </Tooltip>
        </TableCell>
      </TableRow>
      <TableRow>
        <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={4}>
          <Collapse in={open} timeout="auto" unmountOnExit>
            <Box sx={{ margin: 1 }}>
              <Typography variant="h6" gutterBottom component="div">
                Parameters
              </Typography>
              <ParameterList parameters={event.parameters} />
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  );
};

interface EventTableProps {
  contractAddress: string;
  events: EventContext[];
}

export const EventTable: React.FC<EventTableProps> = ({ contractAddress, events }) => {
  return (
    <Box sx={{ 
      width: '100%',
      display: 'flex',
      flexDirection: 'column',
      gap: 2
    }}>
      {events.map((event, index) => {
        switch (event.eventName) {
          case 'Transfer':
            return <TransferEventRow key={index} event={event} tokenName={getTokenName(contractAddress)} />;
          case 'Approval':
            return <ApprovalEventRow key={index} event={event} tokenName={getTokenName(contractAddress)} />;
          case 'Swap':
            return <SwapEventRow key={index} event={event} tokenName={getTokenName(contractAddress)} />;
          default:
            return null;
        }
      })}
    </Box>
  );
}; 