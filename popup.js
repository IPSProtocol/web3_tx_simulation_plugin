document.addEventListener('DOMContentLoaded', async () => {
  const simulationResult = document.querySelector('.simulation-result');
  const statusElement = document.querySelector('.status');
  const txHashElement = document.getElementById('txHash');
  const gasEstimateElement = document.getElementById('gasEstimate');
  const probabilityElement = document.getElementById('probability');
  const outputElement = document.getElementById('output');
  const simulateBtn = document.getElementById('simulateBtn');

  // Load and display the last simulation result if it exists
  const data = await chrome.storage.local.get('lastSimulation');
  if (data.lastSimulation) {
    displaySimulationResult(data.lastSimulation.result);
  }

  // Update UI with simulation result
  function displaySimulationResult(result) {
    simulationResult.classList.add('active');
    
    if (result.success) {
      statusElement.textContent = 'Success';
      statusElement.className = 'status success';
      
      gasEstimateElement.textContent = result.gasEstimate;
      probabilityElement.textContent = result.probability;
      
      if (result.output && result.output.effects) {
        outputElement.textContent = result.output.effects.join('\n');
      }
    } else {
      statusElement.textContent = 'Error';
      statusElement.className = 'status error';
      outputElement.textContent = result.error || 'Simulation failed';
    }
  }

  // Handle manual simulation button click
  simulateBtn.addEventListener('click', async () => {
    simulateBtn.disabled = true;
    statusElement.textContent = 'Simulating...';
    
    try {
      // Get the active tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      // Send message to content script to trigger simulation
      chrome.tabs.sendMessage(tab.id, { type: 'TRIGGER_SIMULATION' }, (response) => {
        if (response && response.success) {
          displaySimulationResult(response);
        } else {
          statusElement.textContent = 'Error';
          statusElement.className = 'status error';
          outputElement.textContent = 'No transaction found to simulate';
        }
        simulateBtn.disabled = false;
      });
    } catch (error) {
      statusElement.textContent = 'Error';
      statusElement.className = 'status error';
      outputElement.textContent = error.message;
      simulateBtn.disabled = false;
    }
  });
}); 