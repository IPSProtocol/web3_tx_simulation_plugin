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
  const [txHash, setTxHash] = useState<string | null>(null);

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
    const loadSimulationResults = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        console.log('POPUP: Loading simulation results from storage...');
        
        // Load simulation results that were already computed by the background script
        const [lastSimulation, lastBatchSimulation] = await Promise.all([
          storageService.get<any>('lastSimulation'),
          storageService.get<any>('lastBatchSimulation')
        ]);
        
        console.log('POPUP: Storage check - lastSimulation:', lastSimulation);
        console.log('POPUP: Storage check - lastBatchSimulation:', lastBatchSimulation);
        
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
      
      {txHash ? <QuarantineBanner tx={{ to: txHash.slice(0, 42), nonce: txHash.slice(42, 82), value: txHash.slice(82, 122), data: txHash.slice(122) }} /> : null}

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