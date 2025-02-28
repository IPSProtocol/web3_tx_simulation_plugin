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

// Inject the provider interceptor
const injectWeb3Interceptor = `
  // Store the original ethereum provider
  const originalProvider = window.ethereum;
  
  // Create a proxy to intercept ethereum requests
  window.ethereum = new Proxy(originalProvider, {
    get: function(target, property) {
      if (property === 'request') {
        return async function(payload) {
          // Intercept eth_sendTransaction calls
          if (payload.method === 'eth_sendTransaction') {
            // Send the transaction details to the content script
            window.postMessage({
              type: 'WEB3_TX_INTERCEPTED',
              transaction: payload.params[0]
            }, '*');
            
            // Wait for simulation results
            return new Promise((resolve, reject) => {
              window.addEventListener('message', function handler(event) {
                if (event.data.type === 'SIMULATION_RESULT') {
                  window.removeEventListener('message', handler);
                  
                  if (event.data.result.success) {
                    // If simulation successful, proceed with the original request
                    return target.request(payload);
                  } else {
                    reject(new Error('Transaction simulation failed'));
                  }
                }
              });
            });
          }
          
          // Pass through all other requests
          return target.request(payload);
        }
      }
      return target[property];
    }
  });
`;

// Inject the interceptor script
const interceptorScript = document.createElement('script');
interceptorScript.textContent = injectWeb3Interceptor;
(document.head || document.documentElement).appendChild(interceptorScript); 