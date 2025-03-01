// Inject our page script into the webpage
const script = document.createElement('script');
script.src = chrome.runtime.getURL('pageScript.js');
(document.head || document.documentElement).appendChild(script);

// Listen for messages from the injected script
window.addEventListener('message', async function(event) {
  // Only accept messages from the same frame
  if (event.source !== window) return;

  if (event.data.type && event.data.type === 'WEB3_TX_INTERCEPTED') {
    const transaction = event.data.transaction;
    
    // Send the transaction to the background script for simulation
    chrome.runtime.sendMessage({
      type: 'SIMULATE_TRANSACTION',
      transaction: transaction
    }, response => {
      // Send simulation results back to the page
      window.postMessage({
        type: 'SIMULATION_RESULT',
        result: response
      }, '*');
    });
  }
});

// Content script entry point
console.log('Content script loaded');