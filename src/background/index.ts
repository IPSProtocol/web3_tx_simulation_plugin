import { EthereumRequest, SimulationResult, BatchSimulationResult, WalletSendCallsParams, createMockBatchSimulationResult } from '../types/transaction';

// Listen for simulation requests from the content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'SIMULATE_TRANSACTION') {
    handleSimulation(request.transaction)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Will respond asynchronously
  }
  
  if (request.type === 'SIMULATE_BATCH_TRANSACTION') {
    handleBatchSimulation(request.batch)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Will respond asynchronously
  }
  
  if (request.type === 'OPEN_POPUP') {
    // Open the popup window
    chrome.action.openPopup().catch(() => {
      // If openPopup fails (not supported), we can't force popup open
      console.log('SIMULATION PLUGIN: Could not auto-open popup');
    });
  }
});

async function handleSimulation(transaction: EthereumRequest) {
  try {
    const simulationResult = await simulateTransaction(transaction);
    
    await chrome.storage.local.set({
      lastSimulation: {
        timestamp: Date.now(),
        transaction: transaction,
        result: simulationResult
      }
    });
    
    return {
      success: true,
      gasEstimate: simulationResult.gasEstimate,
      events: simulationResult.events
    };
  } catch (error) {
    console.error('Simulation failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

async function handleBatchSimulation(batch: WalletSendCallsParams) {
  try {
    console.log('Simulating batch transaction:', batch);
    const batchResult = await simulateBatchTransaction(batch);
    
    await chrome.storage.local.set({
      lastBatchSimulation: {
        timestamp: Date.now(),
        batch: batch,
        result: batchResult
      }
    });
    
    return {
      success: true,
      results: batchResult.results
    };
  } catch (error) {
    console.error('Batch simulation failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

async function simulateTransaction(transaction: EthereumRequest): Promise<SimulationResult> {
  // Mock simulation - replace with actual simulation engine call
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        success: true,
        gasEstimate: '100000',
        events: {}
      });
    }, 1000);
  });
}

async function simulateBatchTransaction(batch: WalletSendCallsParams): Promise<BatchSimulationResult> {
  // Mock batch simulation - replace with actual simulation engine call
  return new Promise((resolve) => {
    setTimeout(() => {
      // For now, return mock data that matches the number of calls
      const mockResult = createMockBatchSimulationResult();
      
      // Adjust the mock result to match the actual number of calls in the batch
      while (mockResult.results.length < batch.calls.length) {
        mockResult.results.push({
          success: true,
          gasEstimate: '50000',
          events: {}
        });
      }
      
      mockResult.results = mockResult.results.slice(0, batch.calls.length);
      
      resolve(mockResult);
    }, 1500);
  });
}

// Background script entry point
console.log('Background script loaded'); 