import { EthereumRequest, SimulationResult } from '../types/transaction';

// Listen for simulation requests from the content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'SIMULATE_TRANSACTION') {
    handleSimulation(request.transaction)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Will respond asynchronously
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

// Background script entry point
console.log('Background script loaded'); 