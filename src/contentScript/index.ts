/**
 * This script is the "bridge" between the webpage and the extension's background script.
 * It is responsible for injecting the pageScript and relaying messages.
 */

console.log('Content script loaded. Injecting page script.');

// 1. Inject the page script
// This script runs in the webpage's context and has access to `window.ethereum`.
const script = document.createElement('script');
script.src = chrome.runtime.getURL('pageScript.js');
(document.head || document.documentElement).appendChild(script);

// 2. Listen for messages from the page script
window.addEventListener('message', (event) => {
  // We only accept messages from the same frame, and only from our page script.
  if (event.source !== window || !event.data.type || event.data.type !== 'WEB3_TX_INTERCEPTED') {
    return;
  }

  console.log('Content script received transaction to simulate:', event.data.transaction);

  // 3. Forward the transaction to the background script for simulation
  chrome.runtime.sendMessage({
    type: 'SIMULATE_TRANSACTION',
    transaction: event.data.transaction
  }, response => {
    // 4. Send the simulation result back to the page script
    console.log('Content script forwarding simulation result:', response);
    window.postMessage({
      type: 'SIMULATION_RESULT',
      result: response,
      // We also pass the original payload back so the page script can execute it
      payload: event.data.transaction 
    }, window.location.origin);
  });
});

// Clean up the script element after it has been loaded
script.onload = () => {
  script.remove();
};