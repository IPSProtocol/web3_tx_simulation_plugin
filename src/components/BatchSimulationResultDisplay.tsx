import React from 'react';
import { Box, Typography, Paper, Divider, Chip, Alert, Stack } from '@mui/material';
import { 
  BatchSimulationResult, 
  ParsedSimulationResult, 
  ParsedTransactionResult, 
  ParsedEvent 
} from '../types/simulation_interfaces';
import { shortenAddress } from '../utils/address';

interface BatchSimulationResultDisplayProps {
  batchResult: BatchSimulationResult;
}

export const BatchSimulationResultDisplay: React.FC<BatchSimulationResultDisplayProps> = ({ batchResult }) => {
  // Error handling
  if (!batchResult || !batchResult.success) {
    return (
      <Alert severity="error" sx={{ mb: 2 }}>
        <Typography variant="h6">Simulation Failed</Typography>
        <Typography>{batchResult?.error || 'Batch simulation failed.'}</Typography>
      </Alert>
    );
  }

  if (!batchResult.results || batchResult.results.length === 0) {
    return (
      <Alert severity="warning" sx={{ mb: 2 }}>
        <Typography>No simulation results available.</Typography>
      </Alert>
    );
  }

  // Enhanced event formatter
  const formatEvent = (event: ParsedEvent): { title: string; details: { label: string; value: string }[] } => {
    const eventFormatters: Record<string, (event: ParsedEvent) => { title: string; details: { label: string; value: string }[] }> = {
      // Transfer(address,address,uint256)
      "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef": (event) => {
        const from = event.parametersDecoded?.[0]?.decodedValue || event.parameters[0] || 'Unknown';
        const to = event.parametersDecoded?.[1]?.decodedValue || event.parameters[1] || 'Unknown';
        const amount = event.parametersDecoded?.[2]?.decodedValue || event.parameters[2] || 'Unknown';
        
        return {
          title: "Transfer",
          details: [
            { label: "From", value: from },
            { label: "To", value: to },
            { label: "Amount", value: amount }
          ]
        };
      },
      
      // Approval(address,address,uint256)
      "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925": (event) => {
        const owner = event.parametersDecoded?.[0]?.decodedValue || event.parameters[0] || 'Unknown';
        const spender = event.parametersDecoded?.[1]?.decodedValue || event.parameters[1] || 'Unknown';
        const amount = event.parametersDecoded?.[2]?.decodedValue || event.parameters[2] || 'Unknown';
        
        return {
          title: "Approval",
          details: [
            { label: "Owner", value: owner },
            { label: "Spender", value: spender },
            { label: "Amount", value: amount }
          ]
        };
      }
    };

    const formatter = eventFormatters[event.eventSignature];
    if (formatter) {
      return formatter(event);
    }

    // Default formatting for unknown events
    return {
      title: event.decodedEventName || `Unknown Event (${event.eventSignature.slice(0, 10)}...)`,
      details: event.parametersDecoded?.map((param, index) => ({
        label: `Param ${index}`,
        value: param.decodedValue || param.value
      })) || []
    };
  };

  return (
    <Box sx={{ width: '100%' }}>
      {/* Render each block result */}
      {batchResult.results.map((blockResult: ParsedSimulationResult, blockIndex: number) => (
        <Paper 
          key={blockIndex} 
          elevation={2} 
          sx={{ 
            p: 3, 
            mb: 4, 
            borderRadius: 2,
            border: '1px solid rgba(0, 0, 0, 0.12)'
          }}
        >
          {/* Render each transaction in the block */}
          {blockResult.transactions.map((transaction: ParsedTransactionResult, txIndex: number) => {
            // Debug logging for events
            console.log('DISPLAY: Transaction events:', transaction.events);
            console.log('DISPLAY: Events by contract:', transaction.eventsByContract);
            
            return (
            <Box key={txIndex} sx={{ mb: 3 }}>
              <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 3 }}>
                <Typography variant="h6" component="div">
                  Transaction {transaction.transactionIndex + 1}
                </Typography>
                <Chip 
                  label={transaction.success ? 'SUCCESS' : 'FAILED'} 
                  color={transaction.success ? 'success' : 'error'}
                  size="small"
                />
                <Typography variant="body2" color="text.secondary">
                  Gas: {parseInt(transaction.gasUsed, 16).toLocaleString()}
                </Typography>
              </Stack>

              {/* Error Display */}
              {transaction.error && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  <Typography variant="subtitle2">Transaction Error:</Typography>
                  <Typography variant="body2">{transaction.error.message}</Typography>
                </Alert>
              )}
              
              {/* Events Display - Each event in its own row */}
              {transaction.events.length === 0 ? (
                <Typography color="text.secondary" sx={{ fontStyle: 'italic', textAlign: 'center', py: 3 }}>
                  No events emitted in this transaction.
                </Typography>
              ) : (
                <Box>
                  <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 'medium' }}>
                    Events ({transaction.events.length})
                  </Typography>
                  
                  {/* Display each event in its own row */}
                  <Stack spacing={2}>
                    {transaction.events.map((event: ParsedEvent, eventIndex: number) => {
                      const formattedEvent = formatEvent(event);
                      return (
                        <Paper 
                          key={eventIndex} 
                          elevation={1} 
                          sx={{ 
                            p: 3, 
                            border: '1px solid', 
                            borderColor: 'divider',
                            backgroundColor: 'background.paper'
                          }}
                        >
                          <Stack direction="row" spacing={2} alignItems="flex-start">
                            {/* Event Title */}
                            <Box sx={{ minWidth: 120 }}>
                              <Typography variant="h6" sx={{ fontWeight: 'medium', color: 'primary.main' }}>
                                {formattedEvent.title}
                              </Typography>
                              <Chip 
                                label={shortenAddress(event.contractAddress)} 
                                size="small" 
                                variant="outlined"
                                sx={{ mt: 1 }}
                              />
                            </Box>
                            
                            {/* Event Details */}
                            <Box sx={{ flex: 1 }}>
                              {formattedEvent.details.length > 0 ? (
                                <Stack spacing={1}>
                                  {formattedEvent.details.map((detail, detailIndex) => (
                                    <Box key={detailIndex} sx={{ display: 'flex', alignItems: 'center' }}>
                                      <Typography variant="body2" sx={{ fontWeight: 'medium', minWidth: 80, color: 'text.secondary' }}>
                                        {detail.label}:
                                      </Typography>
                                      <Typography variant="body2" sx={{ fontFamily: 'monospace', ml: 1, wordBreak: 'break-all' }}>
                                        {detail.value}
                                      </Typography>
                                    </Box>
                                  ))}
                                </Stack>
                              ) : (
                                <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                                  No parameters
                                </Typography>
                              )}
                            </Box>
                          </Stack>
                        </Paper>
                      );
                    })}
                  </Stack>
                </Box>
              )}
            </Box>
            );
          })}
        </Paper>
      ))}
    </Box>
  );
}; 