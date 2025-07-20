import React from 'react';
import { Box, Typography, Paper, Divider, Chip } from '@mui/material';
import { BatchSimulationResult, SimulationResult, ContractEvents } from '../types/transaction';
import { EventTable } from './EventTable';
import { shortenAddress } from '../utils/address';

interface BatchSimulationResultDisplayProps {
  batchResult: BatchSimulationResult;
}

export const BatchSimulationResultDisplay: React.FC<BatchSimulationResultDisplayProps> = ({ batchResult }) => {
  if (!batchResult || !batchResult.success) {
    return (
      <Typography color="error">
        {batchResult?.error || 'Batch simulation failed.'}
      </Typography>
    );
  }

  return (
    <Box sx={{ width: '100%' }}>
      {batchResult.results.map((result: SimulationResult, txIndex: number) => (
        <Paper 
          key={txIndex} 
          elevation={2} 
          sx={{ 
            p: 3, 
            mb: 4, 
            borderRadius: 2,
            border: '1px solid rgba(0, 0, 0, 0.12)'
          }}
        >
          <Typography variant="h5" gutterBottom component="div" sx={{ fontWeight: 'medium' }}>
            Transaction {txIndex + 1}
          </Typography>
          <Divider sx={{ my: 2 }} />
          
          {Object.keys(result.events).length === 0 ? (
            <Typography color="text.secondary">No events emitted in this transaction.</Typography>
          ) : (
            Object.entries(result.events).map(([contractAddress, events]) => (
              <Box key={contractAddress} sx={{ mt: 2 }}>
                <Typography variant="overline" color="text.secondary">
                  Events from Contract
                </Typography>
                <Chip label={shortenAddress(contractAddress)} size="small" sx={{ ml: 1, mb: 2 }} />
                <EventTable contractAddress={contractAddress} events={events} />
              </Box>
            ))
          )}
        </Paper>
      ))}
    </Box>
  );
}; 