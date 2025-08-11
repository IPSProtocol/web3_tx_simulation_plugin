import React from 'react';
import { Box, Typography, Paper, Chip, Alert, Stack } from '@mui/material';
import { 
  BatchSimulationResult, 
  ParsedSimulationResult, 
  ParsedTransactionResult, 
  ParsedEvent 
} from '../types/simulation_interfaces';
import { shortenAddress } from '../utils/address';

interface BatchSimulationResultDisplayProps {
  batchResult: BatchSimulationResult;
  userAddress?: string | null;
}

export const BatchSimulationResultDisplay: React.FC<BatchSimulationResultDisplayProps> = ({ batchResult, userAddress }) => {
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

  // Enhanced event formatter (kept for fallback use)
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
            { label: "From", value: shortenAddress(from) },
            { label: "To", value: shortenAddress(to) },
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
            { label: "Owner", value: shortenAddress(owner) },
            { label: "Spender", value: shortenAddress(spender) },
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

  // Token name mapping (lowercased addresses)
  const TOKEN_NAMES: Record<string, string> = {
    '0x823c7e425cf9c3fd3e2431543a67c96c6451a615': 'WETH',
    '0x209cef5f2d235a0fa02532197ada1d4282992d43': 'FETH',
    '0x297def8515c99c03eb0cf8da939baf6d45a2c609': 'WBTC',
  };

  const buildMetaMaskLikeChanges = (events: ParsedEvent[], primaryUser?: string | null) => {
    const changes: Array<{
      kind: 'send' | 'receive' | 'approve';
      label: string;
      amount?: string;
      token?: string;
      counterparty?: string;
    }> = [];
    const user = (primaryUser || '').toLowerCase();
    events.forEach((ev) => {
      const sig = ev.eventSignature;
      const params = ev.parametersDecoded || [] as any[];
      if (sig === '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef') {
        const from = (params[0]?.decodedValue || ev.parameters[0] || '').toLowerCase();
        const to = (params[1]?.decodedValue || ev.parameters[1] || '').toLowerCase();
        const amount = params[2]?.decodedValue || ev.parameters[2] || '';
        if (user && from === user) {
          changes.push({ kind: 'send', label: 'You send', amount: amount, token: ev.contractAddress, counterparty: to });
        } else if (user && to === user) {
          changes.push({ kind: 'receive', label: 'You receive', amount: amount, token: ev.contractAddress, counterparty: from });
        }
      }
      if (sig === '0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925') {
        const owner = (params[0]?.decodedValue || ev.parameters[0] || '').toLowerCase();
        const spender = (params[1]?.decodedValue || ev.parameters[1] || '').toLowerCase();
        const amount = params[2]?.decodedValue || ev.parameters[2] || '';
        if (user && owner === user) {
          changes.push({ kind: 'approve', label: 'You approve', amount, token: ev.contractAddress, counterparty: spender });
        }
      }
    });
    return changes;
  };

  return (
    <Box sx={{ width: '100%' }}>
      {/* Render each block result */}
      {batchResult.results.map((blockResult: ParsedSimulationResult, blockIndex: number) => (
        <Paper 
          key={blockIndex} 
          elevation={2} 
          sx={{ 
            p: 2, 
            mb: 2, 
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
            <Box key={txIndex} sx={{ mb: 2 }}>
              <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1.5 }}>
                <Typography variant="subtitle1" component="div" sx={{ fontWeight: 600 }}>
                  Transaction {transaction.transactionIndex + 1}
                </Typography>
                <Chip 
                  label={transaction.success ? 'SUCCESS' : 'FAILED'} 
                  color={transaction.success ? 'success' : 'error'}
                  size="small"
                />
                <Typography variant="caption" color="text.secondary">
                  Gas: {parseInt(transaction.gasUsed, 16).toLocaleString()}
                </Typography>
              </Stack>

              {/* MetaMask-like Estimated changes */}
              {(transaction.events && transaction.events.length > 0) && (
                <Box sx={{ mb: 1.5 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>Estimated changes</Typography>
                  <Stack spacing={1}>
                    {buildMetaMaskLikeChanges(transaction.events, userAddress).map((ch, idx) => {
                      const colorKey = ch.kind === 'receive' ? 'success.main' : (ch.kind === 'send' ? 'error.main' : 'warning.main');
                      const tokenName = ch.token ? (TOKEN_NAMES[(ch.token || '').toLowerCase()] || shortenAddress(ch.token)) : undefined;
                      const displayAmount = ch.amount
                        ? `${ch.kind === 'receive' ? '+' : ch.kind === 'send' ? '-' : ''}${ch.amount}`
                        : undefined;
                      return (
                        <Paper key={idx} variant="outlined" sx={{ p: 1.25, display: 'flex', alignItems: 'center', gap: 1.25 }}>
                          <Typography variant="body2" sx={{ fontWeight: 600, minWidth: 110 }}>{ch.label}</Typography>
                          {displayAmount ? (
                            <Chip 
                              label={displayAmount} 
                              size="small" 
                              sx={{ mr: 1, bgcolor: colorKey, color: 'common.white', fontWeight: 700 }} 
                            />
                          ) : null}
                          {tokenName ? (
                            <Chip label={tokenName} size="small" variant="outlined" />
                          ) : null}
                        </Paper>
                      );
                    })}
                  </Stack>
                </Box>
              )}

              {/* Error Display */}
              {transaction.error && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  <Typography variant="subtitle2">Transaction Error:</Typography>
                  <Typography variant="body2">{transaction.error.message}</Typography>
                </Alert>
              )}
              
            </Box>
            );
          })}
        </Paper>
      ))}
    </Box>
  );
}; 