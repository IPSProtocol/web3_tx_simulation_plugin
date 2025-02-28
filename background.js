// Listen for simulation requests from the content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'SIMULATE_TRANSACTION') {
    handleSimulation(request.transaction)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Will respond asynchronously
  }
});

// Handle the simulation request
async function handleSimulation(transaction) {
  try {
    // Here you would typically call your simulation engine API
    // For now, we'll return a mock response
    const simulationResult = await simulateTransaction(transaction);
    
    // Store the result in extension storage
    await chrome.storage.local.set({
      lastSimulation: {
        timestamp: Date.now(),
        transaction: transaction,
        result: simulationResult
      }
    });
    
    return {
      success: true,
      ...simulationResult
    };
  } catch (error) {
    console.error('Simulation failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Mock simulation function - replace this with your actual simulation engine call
async function simulateTransaction(transaction) {
  // This is where you would make the API call to your simulation engine
  // For now, we'll return mock data
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        gasEstimate: '21000',
        probability: '95%',
        output: {
          success: true,
          effects: [
            'Token transfer will succeed',
            'Estimated gas cost: 0.001 ETH',
            'No known security issues detected'
          ]
        }
      });
    }, 1000);
  });
} 