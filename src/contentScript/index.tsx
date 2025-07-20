/**
 * This script is the "bridge" between the webpage and the extension's background script.
 * It is responsible for injecting the pageScript and relaying messages.
 */

console.log(' SIMULATION PLUGIN: ContentScript starting...');

// 1. Inject the page script
// This script runs in the webpage's context and has access to `window.ethereum`.
const script = document.createElement('script');
script.src = chrome.runtime.getURL('pageScript.js');

console.log(' SIMULATION PLUGIN: ContentScript injecting pageScript from:', script.src);

// Add error handling for script loading
script.onerror = (error) => {
  console.error(' SIMULATION PLUGIN: ContentScript failed to load pageScript.js:', error);
};

script.onload = () => {
  console.log(' SIMULATION PLUGIN: ContentScript pageScript.js loaded successfully');
  script.remove();
};

(document.head || document.documentElement).appendChild(script);

// 2. Listen for messages from the page script
window.addEventListener('message', (event) => {
  // Only log our own messages to avoid spam
  if (event.data.type && (event.data.type.includes('WEB3_') || event.data.type.includes('SIMULATION'))) {
    console.log(' SIMULATION PLUGIN: ContentScript received message:', event.data);
  }
  
  // We only accept messages from the same frame, and only from our page script.
  if (event.source !== window || !event.data.type) {
    return;
  }

  // Handle single transaction interception
  if (event.data.type === 'WEB3_TX_INTERCEPTED') {
    console.log('SIMULATION PLUGIN: ContentScript handling single transaction:', event.data.transaction);

    // Open the popup to show simulation results
    chrome.runtime.sendMessage({ type: 'OPEN_POPUP' });

    // 3. Forward the transaction to the background script for simulation
    chrome.runtime.sendMessage({
      type: 'SIMULATE_TRANSACTION',
      transaction: event.data.transaction
    }, response => {
      // 4. Send the simulation result back to the page script
      console.log('SIMULATION PLUGIN: ContentScript forwarding simulation result:', response);
      window.postMessage({
        type: 'SIMULATION_RESULT',
        result: response,
        payload: event.data.transaction 
      }, window.location.origin);
    });
  }

  // Handle batch transaction interception
  if (event.data.type === 'WEB3_BATCH_TX_INTERCEPTED') {
    console.log('SIMULATION PLUGIN: ContentScript handling batch transaction:', event.data.batch);

    // Open the popup to show simulation results
    chrome.runtime.sendMessage({ type: 'OPEN_POPUP' });

    // 3. Forward the batch to the background script for simulation
    chrome.runtime.sendMessage({
      type: 'SIMULATE_BATCH_TRANSACTION',
      batch: event.data.batch
    }, response => {
      // 4. Send the simulation result back to the page script
      console.log('SIMULATION PLUGIN: ContentScript forwarding batch simulation result:', response);
      window.postMessage({
        type: 'BATCH_SIMULATION_RESULT',
        result: response,
        payload: event.data.batch 
      }, window.location.origin);
    });
  }
});

console.log('SIMULATION PLUGIN: ContentScript setup complete, listening for messages...');

// Listen for messages from popup (approve/reject)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'USER_APPROVED') {
    console.log('SIMULATION PLUGIN: User approved transaction');
    window.postMessage({ type: 'USER_APPROVED' }, '*');
  } else if (message.type === 'USER_REJECTED') {
    console.log('SIMULATION PLUGIN: User rejected transaction');
    window.postMessage({ type: 'USER_REJECTED' }, '*');
  }
}); 