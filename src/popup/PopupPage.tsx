import React, { useState, useEffect } from 'react';
import { Box, Typography, CircularProgress, Paper, Stack, Button, Alert } from '@mui/material';
import { BatchSimulationResult } from '../types/simulation_interfaces';
import { StorageService } from '../services/storageService';
import { BatchSimulationResultDisplay } from '../components/BatchSimulationResultDisplay';
import QuarantineBanner from '../components/QuarantineBanner';

const storageService = new StorageService();

const PopupPage: React.FC = () => {
  const [batchSimulationResult, setBatchSimulationResult] = useState<BatchSimulationResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [txForBanner, setTxForBanner] = useState<{ to?: string; nonce?: string | number | bigint; value?: string | number | bigint; data?: string } | null>(null);

  const handleApprove = () => {
    console.log('POPUP: User approved transaction');
    // Send approval message to page script
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'USER_APPROVED' });
      }
    });
    // // Send message to App component to navigate to IntentGuard page
    // // Use window.postMessage for internal popup communication
    // window.postMessage({ type: 'TRANSACTION_APPROVED' }, '*');
  };

  const handleReject = () => {
    console.log('POPUP: User rejected transaction');
    // Send rejection message to page script
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'USER_REJECTED' });
      }
    });
    // Send message to App component to navigate to IntentGuard page
    // Use window.postMessage for internal popup communication
    window.postMessage({ type: 'TRANSACTION_REJECTED' }, '*');
  };

  useEffect(() => {
    const loadSimulationResults = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        console.log('POPUP: Loading simulation results from storage...');
        
        // Load simulation results that were already computed by the background script
        const [lastSimulation, lastBatchSimulation, pendingTransactions] = await Promise.all([
          storageService.get<any>('lastSimulation'),
          storageService.get<any>('lastBatchSimulation'),
          storageService.get<any>('pendingTransactions')
        ]);
        
        console.log('POPUP: Storage check - lastSimulation:', lastSimulation);
        console.log('POPUP: Storage check - lastBatchSimulation:', lastBatchSimulation);
        console.log('POPUP: Storage check - pendingTransactions:', pendingTransactions);
        
        // Use the most recent simulation result
        let mostRecentResult = null;
        let mostRecentTimestamp = 0;
        
        if (lastBatchSimulation && lastBatchSimulation.result && lastBatchSimulation.timestamp) {
          if (lastBatchSimulation.timestamp > mostRecentTimestamp) {
            mostRecentResult = lastBatchSimulation.result;
            mostRecentTimestamp = lastBatchSimulation.timestamp;
            console.log('POPUP: Using batch simulation result (timestamp:', lastBatchSimulation.timestamp, ')');
          }
        }
        
        if (lastSimulation && lastSimulation.result && lastSimulation.timestamp) {
          if (lastSimulation.timestamp > mostRecentTimestamp) {
            mostRecentResult = lastSimulation.result;
            mostRecentTimestamp = lastSimulation.timestamp;
            console.log('POPUP: Using single simulation result (timestamp:', lastSimulation.timestamp, ')');
          }
        }
        
        if (mostRecentResult) {
          setBatchSimulationResult(mostRecentResult);
          console.log('POPUP: Successfully loaded simulation result:', mostRecentResult);
        } else {
          setError('No simulation results found. Please perform a transaction first.');
          console.log('POPUP: No simulation results available in storage');
        }

        // Use first pending transaction (set by background) for QuarantineBanner canonical ID
        if (Array.isArray(pendingTransactions) && pendingTransactions.length > 0) {
          setTxForBanner(pendingTransactions[0]);
        } else if (lastSimulation?.transaction) {
          // Fallback for single tx path
          setTxForBanner({
            to: lastSimulation.transaction.to,
            nonce: lastSimulation.transaction.nonce,
            value: lastSimulation.transaction.value,
            data: lastSimulation.transaction.data,
          });
        }
        
        setIsLoading(false);
        
      } catch (error) {
        console.error('POPUP: Error loading simulation results:', error);
        setError(`Failed to load simulation results: ${error instanceof Error ? error.message : 'Unknown error'}`);
        setIsLoading(false);
      }
    };

    loadSimulationResults();

    // Listen for real-time updates when new simulations are performed
    const handleStorageUpdate = () => {
      console.log('POPUP: Storage updated, reloading results...');
      loadSimulationResults();
    };

    // Listen for storage changes
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.onChanged.addListener(handleStorageUpdate);
      // Also listen for intercept found to update UI immediately
      const handleMsg = (msg: any) => {
        if (msg?.type === 'INTENTGUARD_INTERCEPT_FOUND') {
          console.log('POPUP: Intercept found, refreshing UI');
          loadSimulationResults();
        }
      };
      chrome.runtime.onMessage.addListener(handleMsg);
      return () => {
        chrome.storage.onChanged.removeListener(handleStorageUpdate);
        chrome.runtime.onMessage.removeListener(handleMsg);
      };
    }
  }, []);

  const renderContent = () => {
    if (isLoading) {
      return (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <CircularProgress />
          <Typography>Loading simulation results...</Typography>
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
      return (
        <BatchSimulationResultDisplay 
          batchResult={batchSimulationResult} 
          userAddress={"0x4c1f7920EfFfd0d7B008908dB9677771e7781a6D"}
        />
      );
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
        width: 700,
        minHeight: '100vh',
        p: 3,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'grey.100',
      }}
    >
      <Stack spacing={1.5} sx={{ width: '100%', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6" component="h3" gutterBottom>
          IntentGuard Simulation Results
        </Typography>
      </Stack>
      
      {renderContent()}
      
      {/* {txForBanner ? <QuarantineBanner tx={txForBanner} /> : null} */}

      {/* Action buttons for approving or rejecting the transaction */}
      <Stack direction="row" spacing={2} sx={{ mt: 2 }}>
        <Button 
          variant="contained" 
          color="error" 
          onClick={handleReject}
          size="medium"
        >
          Reject Transaction
        </Button>
        <Button 
          variant="contained" 
          color="success" 
          onClick={handleApprove}
          size="medium"
        >
          Approve Transaction
        </Button>
      </Stack>
    </Box>
  );
};

export default PopupPage;