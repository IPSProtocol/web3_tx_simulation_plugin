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

  return (
    <Box sx={{ width: '100%' }}>
      {/* Gas Estimate Display */}
      {batchResult.gasEstimate && (
        <Paper elevation={1} sx={{ p: 2, mb: 3, backgroundColor: 'primary.light', color: 'primary.contrastText' }}>
          <Typography variant="h6">Estimated Gas: {batchResult.gasEstimate.toLocaleString()}</Typography>
        </Paper>
      )}

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
          {/* Block Header */}
          <Box sx={{ mb: 3 }}>
            <Typography variant="h5" gutterBottom component="div" sx={{ fontWeight: 'medium' }}>
              Block {parseInt(blockResult.blockNumber, 16)}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Hash: {shortenAddress(blockResult.blockHash)}
            </Typography>
          </Box>
          <Divider sx={{ my: 2 }} />
          
          {/* Render each transaction in the block */}
          {blockResult.transactions.map((transaction: ParsedTransactionResult, txIndex: number) => (
            <Box key={txIndex} sx={{ mb: 3 }}>
              <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
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

              {/* Events Display */}
              {transaction.events.length === 0 ? (
                <Typography color="text.secondary" sx={{ fontStyle: 'italic' }}>
                  No events emitted in this transaction.
                </Typography>
              ) : (
                <Box>
                  <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 'medium' }}>
                    Events ({transaction.events.length})
                  </Typography>
                  
                  {/* Group events by contract */}
                  {Array.from(transaction.eventsByContract.entries()).map(([contractAddress, events]) => (
                    <Paper 
                      key={contractAddress} 
                      variant="outlined" 
                      sx={{ p: 2, mb: 2, backgroundColor: 'grey.50' }}
                    >
                      <Box sx={{ mb: 2 }}>
                        <Typography variant="overline" color="text.secondary">
                          Contract
                        </Typography>
                        <Chip 
                          label={shortenAddress(contractAddress)} 
                          size="small" 
                          sx={{ ml: 1, mb: 1 }} 
                        />
                        <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                          ({events.length} events)
                        </Typography>
                      </Box>

                      {/* Render individual events */}
                      <Stack spacing={1}>
                        {events.map((event: ParsedEvent, eventIndex: number) => (
                          <Paper 
                            key={eventIndex} 
                            elevation={0} 
                            sx={{ p: 2, border: '1px solid', borderColor: 'divider' }}
                          >
                            <Typography variant="subtitle2" sx={{ fontWeight: 'medium', mb: 1 }}>
                              {event.decodedEventName || event.eventSignature}
                            </Typography>
                            
                            {/* Event Parameters */}
                            {event.parametersDecoded && event.parametersDecoded.length > 0 ? (
                              <Box sx={{ ml: 2 }}>
                                <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                                  Parameters:
                                </Typography>
                                {event.parametersDecoded.map((param, paramIndex) => (
                                  <Box key={paramIndex} sx={{ mb: 1 }}>
                                    <Typography variant="body2" component="span" sx={{ fontWeight: 'medium' }}>
                                      [{param.index}]
                                    </Typography>
                                    <Typography variant="body2" component="span" sx={{ ml: 1, fontFamily: 'monospace' }}>
                                      {param.value}
                                    </Typography>
                                  </Box>
                                ))}
                              </Box>
                            ) : (
                              <Typography variant="body2" color="text.secondary" sx={{ ml: 2, fontStyle: 'italic' }}>
                                No parameters
                              </Typography>
                            )}
                          </Paper>
                        ))}
                      </Stack>
                    </Paper>
                  ))}
                </Box>
              )}
            </Box>
          ))}
        </Paper>
      ))}
    </Box>
  );
}; 