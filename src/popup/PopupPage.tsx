import React, { useEffect, useState } from 'react';
import { Box, Typography, CircularProgress, Stack } from '@mui/material';
import { EventTable } from '../components/EventTable';
import { StorageService } from '../services/storageService';
import { SimulationResult } from '../types/transaction';

const storageService = new StorageService();

const PopupPage: React.FC = () => {
  const [simulationResult, setSimulationResult] = useState<SimulationResult | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSimulationRequest = async (request: any) => {
    setLoading(true);
    try {
      setSimulationResult({
        success: true,
        gasEstimate: request.gasEstimate || '50000',
        events: request.events || {},
      });
    } catch (error) {
      setSimulationResult({
        success: false,
        gasEstimate: '0',
        events: {},
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
    setLoading(false);
  };

  const handleMessage = async (message: { type: string; request: any }) => {
    if (message.type === 'SIMULATE_TRANSACTION' && message.request) {
      await handleSimulationRequest(message.request);
    }
  };

  useEffect(() => {
    const loadStoredResult = async () => {
      const storedResult = await storageService.get<SimulationResult>('simulationResult');
      if (storedResult) {
        setSimulationResult(storedResult);
      }
    };

    loadStoredResult();

    // Only add the message listener if we're in a Chrome extension environment
    const isExtension = typeof chrome !== 'undefined' && chrome.runtime !== undefined;
    if (isExtension) {
      chrome.runtime.onMessage.addListener(handleMessage);
      return () => {
        chrome.runtime.onMessage.removeListener(handleMessage);
      };
    }
    
    // For development environment, simulate a transaction after a delay
    if (process.env.NODE_ENV === 'development') {
      const timer = setTimeout(() => {
        handleSimulationRequest({
          gasEstimate: '75000',
          events: {
            // ERC20 Token Contract
            '0x1234567890123456789012345678901234567890': [
              {
                eventName: 'Transfer',
                parameters: [
                  { name: 'from', value: '0x1234...5678', type: 'address' },
                  { name: 'to', value: '0x8765...4321', type: 'address' },
                  { name: 'value', value: '1000000000000000000', type: 'uint256' }
                ],
                contractAddress: '0x1234567890123456789012345678901234567890',
                blockNumber: 1234567,
                transactionHash: '0xabcd...',
                caller: '0x1234...5678'
              },
              {
                eventName: 'Approval',
                parameters: [
                  { name: 'owner', value: '0x1234...5678', type: 'address' },
                  { name: 'spender', value: '0x9876...5432', type: 'address' },
                  { name: 'value', value: '2000000000000000000', type: 'uint256' }
                ],
                contractAddress: '0x1234567890123456789012345678901234567890',
                blockNumber: 1234567,
                transactionHash: '0xabcd...',
                caller: '0x1234...5678'
              }
            ],
            // DEX Contract
            '0x9876543210987654321098765432109876543210': [
              {
                eventName: 'Swap',
                parameters: [
                  { name: 'sender', value: '0x1234...5678', type: 'address' },
                  { name: 'recipient', value: '0x8765...4321', type: 'address' },
                  { name: 'amount0In', value: '1000000000000000000', type: 'uint256' },
                  { name: 'amount1In', value: '0', type: 'uint256' },
                  { name: 'amount0Out', value: '0', type: 'uint256' },
                  { name: 'amount1Out', value: '2975632942', type: 'uint256' }
                ],
                contractAddress: '0x9876543210987654321098765432109876543210',
                blockNumber: 1234567,
                transactionHash: '0xabcd...',
                caller: '0x1234...5678'
              }
            ]
          }
        });
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, []);

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height="100vh">
        <CircularProgress />
      </Box>
    );
  }

  if (!simulationResult) {
    return (
      <Box p={2}>
        <Typography variant="h6" component="h1">
          No simulation results yet
        </Typography>
      </Box>
    );
  }

  return (
    <Box 
      sx={{ 
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        width: '100%',
        margin: 0,
        padding: 0
      }}
    >
      <Box sx={{ 
        width: '60%',
        display: 'flex',
        flexDirection: 'column',
        gap: 4
      }}>
        <Stack spacing={2} alignItems="center">
          <Typography variant="h5" component="h1" align="center">
            Transaction Simulation Results
          </Typography>
          <Typography color="success.main" align="center">
            Simulation successful
          </Typography>
          <Typography align="center">
            Estimated Gas: {simulationResult.gasEstimate}
          </Typography>
        </Stack>

        {simulationResult.success && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {Object.entries(simulationResult.events).map(([contractAddress, events]) => (
              <EventTable key={contractAddress} contractAddress={contractAddress} events={events} />
            ))}
          </Box>
        )}
      </Box>
    </Box>
  );
};

export default PopupPage;