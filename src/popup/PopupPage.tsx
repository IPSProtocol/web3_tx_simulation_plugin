import React, { useState, useEffect } from 'react';
import { Box, Typography, CircularProgress, Paper, Stack, Button } from '@mui/material';
import { SimulationResult, BatchSimulationResult, createMockBatchSimulationResult } from '../types/transaction';
import { StorageService } from '../services/storageService';
import { EventTable } from '../components/EventTable';
import { BatchSimulationResultDisplay } from '../components/BatchSimulationResultDisplay';

const storageService = new StorageService();

const PopupPage: React.FC = () => {
  const [simulationResult, setSimulationResult] = useState<SimulationResult | null>(null);
  const [batchSimulationResult, setBatchSimulationResult] = useState<BatchSimulationResult | null>(null);
  const [simulationType, setSimulationType] = useState<'single' | 'batch'>('batch'); // Default to 'batch' for mocking
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
    const loadSimulationResults = async () => {
      try {
        setIsLoading(true);
        
        // Try to load batch simulation results first
        const batchResult = await storageService.get<any>('lastBatchSimulation');
        if (batchResult && batchResult.result) {
          console.log('POPUP: Loaded batch simulation result:', batchResult);
          setBatchSimulationResult(batchResult.result);
          setSimulationType('batch');
          setIsLoading(false);
          return;
        }
        
        // Fallback to single simulation results
        const singleResult = await storageService.get<SimulationResult>('simulationResult');
        if (singleResult) {
          console.log(' POPUP: Loaded single simulation result:', singleResult);
          setSimulationResult(singleResult);
          setSimulationType('single');
          setIsLoading(false);
          return;
        }
        
        // If no real data, show mock data as fallback
        console.log(' POPUP: No simulation results found, showing mock data');
        const mockBatchData = createMockBatchSimulationResult();
        setBatchSimulationResult(mockBatchData);
        setSimulationType('batch');
        setIsLoading(false);
        
      } catch (error) {
        console.error(' POPUP: Error loading simulation results:', error);
        setError('Failed to load simulation results');
        setIsLoading(false);
      }
    };

    loadSimulationResults();

    // Listen for real-time updates when new simulations are performed
    const handleStorageUpdate = () => {
      console.log(' POPUP: Storage updated, reloading results...');
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
      return <CircularProgress />;
    }

    if (error) {
      return <Typography color="error">{error}</Typography>;
    }

    if (simulationType === 'batch' && batchSimulationResult) {
      return <BatchSimulationResultDisplay batchResult={batchSimulationResult} />;
    }
    
    if (simulationType === 'single' && simulationResult) {
      // Assuming you have a component for single results or just want to render the EventTable directly
      const contractAddress = Object.keys(simulationResult.events)[0];
      const events = simulationResult.events[contractAddress] || [];
      return <EventTable contractAddress={contractAddress} events={events} />;
    }

    return <Typography>No simulation data available.</Typography>;
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
        <Typography variant="subtitle1" color="text.secondary">
          Simulation successful
        </Typography>
        {/* You can make gas estimate dynamic later */}
        <Typography variant="body1">Estimated Gas: 75000</Typography> 
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