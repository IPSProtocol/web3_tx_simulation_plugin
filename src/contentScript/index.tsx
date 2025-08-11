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
// LOGIC ENTRYPOINT
window.addEventListener('message', (event) => {
  // Capture TX_APPROVED from pageScript and forward to background
  if (event.data.type === 'TX_APPROVED') {
    chrome.runtime.sendMessage({ type: 'TX_APPROVED', subtype: event.data.subtype, tx: event.data.tx });
    return;
  }
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
      if (chrome.runtime.lastError) {
        console.error('SIMULATION PLUGIN: Extension context invalidated, reloading page...');
        window.location.reload();
        return;
      }
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

    // Forward the batch to the background script for simulation
    chrome.runtime.sendMessage({
      type: 'SIMULATE_BATCH_TRANSACTION',
      batch: event.data.batch
    }, response => {
      if (chrome.runtime.lastError) {
        console.error('SIMULATION PLUGIN: Extension context invalidated, reloading page...');
        window.location.reload();
        return;
      }
      
      // 4. Send the simulation result back to the page script
      console.log('SIMULATION PLUGIN: ContentScript forwarding batch simulation result:', response);
      window.postMessage({
        type: 'BATCH_SIMULATION_RESULT',
        result: response,
        payload: event.data.batch 
      }, window.location.origin);
      
      // ONLY NOW open the popup after simulation is complete
      if (response && (response.success || response.error)) {
        chrome.runtime.sendMessage({ type: 'OPEN_POPUP' });
      }
    });
  }
});

console.log('SIMULATION PLUGIN: ContentScript setup complete, listening for messages...');

// Single centralized message listener for content script
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  console.log('📨 ContentScript Router received:', msg.type, msg);
  
  if (msg.type === 'REQUEST_PERSONAL_SIGN') {
    console.log('🔄 ContentScript: Received REQUEST_PERSONAL_SIGN');
    
    (async () => {
      try {
        const signature = await obtainSignatureFromPageScript(msg);
        console.log('✅ ContentScript: Sending signature back to background');
        sendResponse({ signature });
      } catch (err) {
        console.error('❌ ContentScript: Error getting signature:', err);
        sendResponse({ error: err instanceof Error ? err.message : 'Unknown error' });
      }
    })();
    
    return true; // Critical: keeps channel open
  }

  if (msg.type === 'REQUEST_RAW_SIGN') {
    (async () => {
      try {
        const signature = await obtainRawSignatureFromPageScript(msg);
        sendResponse({ signature });
      } catch (err) {
        sendResponse({ error: err instanceof Error ? err.message : 'Unknown error' });
      }
    })();
    return true;
  }
  
  if (msg.type === 'USER_APPROVED') {
    handleUserApproval(msg);
    sendResponse({ success: true });
    return false; // Sync response
  }
  
  if (msg.type === 'USER_REJECTED') {
    handleUserRejection(msg);
    sendResponse({ success: true });
    return false; // Sync response
  }
  
  // Unknown message
  console.error('ContentScript: Unknown message type:', msg.type);
  sendResponse({ success: false, error: 'Unknown message type' });
  return false;
});

// Dedicated async handler for personal sign
function handlePersonalSignRequest(message: any, sendResponse: (response: any) => void) {
  console.log('🔄 ContentScript: Starting handlePersonalSignRequest');
  
  (async () => {
    try {
      console.log('🔄 ContentScript: About to call obtainSignatureFromPageScript');
      const signature = await obtainSignatureFromPageScript(message);
      console.log('✅ ContentScript: Personal sign completed:', signature);
      sendResponse({ signature });
    } catch (error) {
      console.error('❌ ContentScript: Personal sign failed:', error);
      sendResponse({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  })();
}

// Sync handlers
function handleUserApproval(message: any) {
  console.log('SIMULATION PLUGIN: User approved transaction');
  window.postMessage({ type: 'USER_APPROVED' }, '*');
}

function handleUserRejection(message: any) {
  console.log('SIMULATION PLUGIN: User rejected transaction');
  window.postMessage({ type: 'USER_REJECTED' }, '*');
}

// Helper function to get signature from page script
async function obtainSignatureFromPageScript(request: any): Promise<string> {
  return new Promise((resolve, reject) => {
    // Forward to page script
    window.postMessage({
      type: 'REQUEST_PERSONAL_SIGN',
      message: request.message,
      address: request.address
    }, window.location.origin);
    
    // Listen for response
    const handleSignResponse = (event: MessageEvent) => {
      if (event.data.type === 'PERSONAL_SIGN_RESPONSE') {
        window.removeEventListener('message', handleSignResponse);
        clearTimeout(timeoutId);
        
        if (event.data.error) {
          reject(new Error(event.data.error));
        } else if (event.data.signature) {
          resolve(event.data.signature);
        } else {
          reject(new Error('No signature received'));
        }
      }
    };
    
    window.addEventListener('message', handleSignResponse);
    
    // 2 minute timeout
    const timeoutId = setTimeout(() => {
      window.removeEventListener('message', handleSignResponse);
      reject(new Error('Signature request timed out'));
    }, 120000);
  });
} 

async function obtainRawSignatureFromPageScript(request: any): Promise<string> {
  return new Promise((resolve, reject) => {
    window.postMessage({
      type: 'REQUEST_RAW_SIGN',
      message: request.message,
      address: request.address
    }, window.location.origin);

    const handle = (event: MessageEvent) => {
      if (event.data.type === 'RAW_SIGN_RESPONSE') {
        window.removeEventListener('message', handle);
        if (event.data.error) return reject(new Error(event.data.error));
        if (event.data.signature) return resolve(event.data.signature);
        return reject(new Error('No signature received'));
      }
    };
    window.addEventListener('message', handle);
    setTimeout(() => {
      window.removeEventListener('message', handle);
      reject(new Error('Raw sign request timed out'));
    }, 120000);
  });
}