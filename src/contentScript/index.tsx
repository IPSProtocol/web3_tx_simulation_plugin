

// Listen for ethereum requests from the webpage
const injectScript = () => {
  const script = document.createElement('script');
  script.textContent = `
    (function() {
      if (window.ethereum) {
        const originalRequest = window.ethereum.request;
        window.ethereum.request = async function(args) {
          const { method, params } = args;

          if (method === 'eth_sendTransaction' && params && params.length > 0) {
            console.log('Intercepted eth_sendTransaction:', params[0]);
            window.postMessage({
              type: 'SIMULATE_TRANSACTION',
              transaction: params[0]
            }, '*');
            // Do not proceed with the original request yet.
            // Wait for the user to approve from the extension popup.
            return new Promise(() => {}); 
          }

          if (method === 'wallet_sendCalls' && params && params.length > 0) {
            console.log('Intercepted wallet_sendCalls:', params[0]);
            // For now, we'll just simulate the first call in the batch.
            // A more robust solution could simulate all of them.
            const transactionToSimulate = params[0].calls[0];
            window.postMessage({
              type: 'SIMULATE_TRANSACTION',
              transaction: transactionToSimulate
            }, '*');
            return new Promise(() => {});
          }

          return originalRequest.apply(this, [args]);
        };
      }
    })();
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