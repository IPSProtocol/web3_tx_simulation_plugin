console.log('SIMULATION PLUGIN: Starting injection...');

// Wait a bit to ensure other extensions have loaded
setTimeout(() => {
  console.log('SIMULATION PLUGIN: Delayed injection starting...');
  
  // Store the current ethereum provider (might already be wrapped by IntentGuard)
  const currentProvider = window.ethereum;
  
  console.log('SIMULATION PLUGIN: Current provider:', currentProvider);
  console.log('SIMULATION PLUGIN: Provider constructor:', currentProvider?.constructor?.name);
  
  if (!currentProvider) {
    console.warn('SIMULATION PLUGIN: No ethereum provider found');
    return;
  }
  
  // Store the original request method
  const originalRequest = currentProvider.request;
  
  if (!originalRequest) {
    console.warn('SIMULATION PLUGIN: No request method found on provider');
    return;
  }
  
  console.log('SIMULATION PLUGIN: Wrapping request method...');
  
  // Override the request method directly
  currentProvider.request = async function(payload) {
    console.log('SIMULATION PLUGIN: Request intercepted:', payload.method, payload);
    
    // Intercept eth_sendTransaction calls
    if (payload.method === 'eth_sendTransaction') {
      console.log('SIMULATION PLUGIN: Intercepted eth_sendTransaction:', payload.params[0]);
      
      // Send the transaction details to the content script
      window.postMessage({
        type: 'WEB3_TX_INTERCEPTED',
        transaction: payload.params[0]
      }, '*');
      
      // Wait for user approval
      return new Promise((resolve, reject) => {
        const handleMessage = (event) => {
          if (event.data.type === 'USER_REJECTED') {
            window.removeEventListener('message', handleMessage);
            reject(new Error('User rejected transaction'));
          } else if (event.data.type === 'USER_APPROVED') {
            window.removeEventListener('message', handleMessage);
            // User approved, proceed with transaction
            resolve(originalRequest.call(this, payload));
          }
        };
        
        window.addEventListener('message', handleMessage);
      });
    }
    
    // Intercept wallet_sendCalls calls
    if (payload.method === 'wallet_sendCalls') {
      console.log('SIMULATION PLUGIN: Intercepted wallet_sendCalls:', payload.params[0]);
      
      const batchRequest = payload.params[0];
      
      // Send the batch details to the content script
      window.postMessage({
        type: 'WEB3_BATCH_TX_INTERCEPTED',
        batch: {
          version: batchRequest.version || '1.0',
          chainId: batchRequest.chainId,
          from: batchRequest.from,
          calls: batchRequest.calls || [],
          capabilities: batchRequest.capabilities
        }
      }, '*');
      
      // Wait for user approval
      return new Promise((resolve, reject) => {
        const handleMessage = (event) => {
          if (event.data.type === 'USER_REJECTED') {
            window.removeEventListener('message', handleMessage);
            reject(new Error('User rejected transaction'));
          } else if (event.data.type === 'USER_APPROVED') {
            window.removeEventListener('message', handleMessage);
            // User approved, proceed with transaction
            resolve(originalRequest.call(this, payload));
          }
        };
        
        window.addEventListener('message', handleMessage);
      });
    }
    
    // For now, let's just pass through to see if we can at least intercept
    return originalRequest.call(this, payload);
  };
  
  console.log('SIMULATION PLUGIN: Injection complete! Provider wrapped.');
  
}, 1000); // Wait 1 second for other extensions to load

console.log('SIMULATION PLUGIN: Script loaded, waiting for delayed injection...'); 