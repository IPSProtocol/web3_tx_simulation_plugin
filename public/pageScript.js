// Store the original ethereum provider
const originalProvider = window.ethereum;

// Create a proxy to intercept ethereum requests
window.ethereum = new Proxy(originalProvider || {}, {
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
        return target.request ? target.request(payload) : Promise.reject(new Error('No provider'));
      }
    }
    return target[property];
  }
}); 