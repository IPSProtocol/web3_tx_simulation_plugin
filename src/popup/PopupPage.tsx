import React, { useState, useEffect } from 'react';
import { Box, Typography, CircularProgress, Paper, Stack, Button, Alert } from '@mui/material';
import { BatchSimulationResult, TransactionArgs } from '../types/simulation_interfaces';
import { StorageService } from '../services/storageService';
import { SimulationService } from '../services/simulationService';
import { BatchSimulationResultDisplay } from '../components/BatchSimulationResultDisplay';

const storageService = new StorageService();
// TODO: Make RPC URL configurable
const simulationService = new SimulationService('https://172.172.168.218:8545');

const PopupPage: React.FC = () => {
  const [batchSimulationResult, setBatchSimulationResult] = useState<BatchSimulationResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const handleApprove = () => {
    console.log('POPUP: User approved transaction');
    // Send approval message to page script
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'USER_APPROVED' });
      }
    });
    window.close();
  };

  const handleReject = () => {
    console.log('POPUP: User rejected transaction');
    // Send rejection message to page script
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'USER_REJECTED' });
      }
    });
    window.close();
  };

  useEffect(() => {
    const loadAndSimulateTransactions = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        // Try to load pending transactions from storage
        const pendingTransactions = await storageService.get<TransactionArgs[]>('pendingTransactions');
        
        if (pendingTransactions && pendingTransactions.length > 0) {
          console.log('POPUP: Found pending transactions, simulating...', pendingTransactions);
          
          let result: BatchSimulationResult;
          
          if (pendingTransactions.length === 1) {
            result = await simulationService.simulateTransaction(pendingTransactions[0]);
          } else {
            result = await simulationService.simulateMultipleTransactions(pendingTransactions);
          }
          
          setBatchSimulationResult(result);
          
          // Save the simulation result for future reference
          await storageService.set('lastBatchSimulation', { result });
        } else {
          // Try to load existing simulation results
          const existingResult = await storageService.get<any>('lastBatchSimulation');
          if (existingResult && existingResult.result) {
            console.log('POPUP: Loaded existing simulation result:', existingResult);
            setBatchSimulationResult(existingResult.result);
          } else {
            setError('No pending transactions found for simulation.');
          }
        }
        
        setIsLoading(false);
        
      } catch (error) {
        console.error('POPUP: Error loading/simulating transactions:', error);
        setError('Failed to load or simulate transactions');
        setIsLoading(false);
      }
    };

    loadAndSimulateTransactions();

    // Listen for real-time updates when new simulations are performed
    const handleStorageUpdate = () => {
      console.log('POPUP: Storage updated, reloading results...');
      loadAndSimulateTransactions();
    };

    // Listen for storage changes
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.onChanged.addListener(handleStorageUpdate);
      return () => {
        chrome.storage.onChanged.removeListener(handleStorageUpdate);
      };
    }
  }, []);

  const renderContent = () => {
    if (isLoading) {
      return (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <CircularProgress />
          <Typography>Simulating transactions...</Typography>
        </Box>
      );
    }

    if (error) {
      return (
        <Alert severity="error">
          <Typography variant="h6">Error</Typography>
          <Typography>{error}</Typography>
        </Alert>
      );
    }

    if (batchSimulationResult) {
      return <BatchSimulationResultDisplay batchResult={batchSimulationResult} />;
    }

    return (
      <Alert severity="warning">
        <Typography>No simulation data available.</Typography>
      </Alert>
    );
  };

  return (
    <Box
      sx={{
        width: 800,
        minHeight: '100vh',
        p: 4,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'grey.100',
      }}
    >
      <Stack spacing={2} sx={{ width: '100%', alignItems: 'center', mb: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          Transaction Simulation Results
        </Typography>
        {batchSimulationResult?.success && (
          <Typography variant="subtitle1" color="success.main">
            Simulation successful
          </Typography>
        )}
        {batchSimulationResult?.gasEstimate && (
          <Typography variant="body1">
            Estimated Gas: {batchSimulationResult.gasEstimate.toLocaleString()}
          </Typography>
        )}
      </Stack>
      
      {renderContent()}
      
      {/* Action buttons for approving or rejecting the transaction */}
      <Stack direction="row" spacing={2} sx={{ mt: 4 }}>
        <Button 
          variant="contained" 
          color="error" 
          onClick={handleReject}
          size="large"
        >
          Reject Transaction
        </Button>
        <Button 
          variant="contained" 
          color="success" 
          onClick={handleApprove}
          size="large"
        >
          Approve Transaction
        </Button>
      </Stack>
    </Box>
  );
};

export default PopupPage;