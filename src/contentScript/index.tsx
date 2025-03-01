

// Listen for ethereum requests from the webpage
const injectScript = () => {
  const script = document.createElement('script');
  script.textContent = `
    // Store the original ethereum.request
    const originalRequest = window.ethereum?.request;
    
    // Override ethereum.request to intercept transactions
    if (window.ethereum) {
      window.ethereum.request = async function(args) {
        // Only intercept eth_sendTransaction calls
        if (args.method === 'eth_sendTransaction') {
          // Send message to extension
          window.postMessage(
            { type: 'SIMULATE_TRANSACTION', request: args },
            window.location.origin
          );
        }
        // Call original request
        return originalRequest.call(window.ethereum, args);
      };
    }
  `;
  
  (document.head || document.documentElement).appendChild(script);
  script.remove();
};

// // Listen for messages from the injected script
// window.addEventListener('message', async (event) => {
//   // Only accept messages from the same window
//   if (event.source !== window) return;

//   if (event.data.type === 'SIMULATE_TRANSACTION') {
//     try {
//       const result = await handleEthereumRequest(event.data.request);
//       // Send result to popup
//       chrome.runtime.sendMessage({
//         type: 'SIMULATION_RESULT',
//         result
//       });
//     } catch (error) {
//       console.error('Simulation error:', error);
//       chrome.runtime.sendMessage({
//         type: 'SIMULATION_ERROR',
//         error: error instanceof Error ? error.message : 'Unknown error'
//       });
//     }
//   }
// });

// Inject the script
injectScript(); 