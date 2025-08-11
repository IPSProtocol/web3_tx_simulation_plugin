import { 
  EthereumRequest, 
  WalletSendCallsParams, 
  TransactionArgs,
  SetCodeAuthorization
} from '../types/simulation_interfaces';
import { QuarantineResponse } from '../types/quarantine';
import { SimulationService } from '../services/simulationService';
import { ethers } from 'ethers';
import { canonicalTxId } from '../utils/canonicalTxId';

// Initialize simulation service with your geth node
const GETH_NODE_URL = 'http://172.172.168.218:8545';
const simulationService = new SimulationService(GETH_NODE_URL);

// MetaMask's delegate contract address (EIP-7702)
const METAMASK_DELEGATE_CONTRACT = '0x63c0c19a282a1B52b07dD5a65b58948A07DAE32B';

// Enhanced logging for background script
function bgLog(...args: any[]) {
  console.log('🔵 BACKGROUND:', ...args);
}

function bgError(...args: any[]) {
  console.error('🔴 BACKGROUND ERROR:', ...args);
}

// Listen for simulation requests from the content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  bgLog('📨 Message Router received:', message.type);
  
  // Route to appropriate handler
  if (message.type === 'SIMULATE_TRANSACTION') {
    handleAsyncMessage(message, sender, sendResponse, handleSimulation);
    return true;
  }
  
  if (message.type === 'SIMULATE_BATCH_TRANSACTION') {
    handleAsyncMessage(message, sender, sendResponse, handleWalletSendCalls);
    return true;
  }
  if (message.type === 'TX_APPROVED') {
    (async () => {
      try {
        if (message.subtype === 'single' && message.tx) {
          // Set current canonical id and reset watcher to only this tx
          const id = canonicalTxId({ to: message.tx.to, nonce: message.tx.nonce, value: message.tx.value, data: message.tx.data });
          intentGuardWatchIds = new Set([id]);
          await chrome.storage.local.set({ pendingTransactions: [message.tx], intentGuardWatchIds: [id], 'quarantine:current': { canonicalId: id, ts: Date.now() } });
          await registerIntentGuardWatch(message.tx);
          sendResponse({ success: true });
          return;
        }
        if (message.subtype === 'batch') {
          const { lastBuiltDelegateTransaction } = await chrome.storage.local.get('lastBuiltDelegateTransaction');
          if (lastBuiltDelegateTransaction) {
            const id = canonicalTxId({ to: lastBuiltDelegateTransaction.to, nonce: lastBuiltDelegateTransaction.nonce, value: lastBuiltDelegateTransaction.value, data: lastBuiltDelegateTransaction.data });
            intentGuardWatchIds = new Set([id]);
            await chrome.storage.local.set({ pendingTransactions: [lastBuiltDelegateTransaction], intentGuardWatchIds: [id], 'quarantine:current': { canonicalId: id, ts: Date.now() } });
            await registerIntentGuardWatch(lastBuiltDelegateTransaction);
            sendResponse({ success: true });
          } else {
            sendResponse({ success: false, error: 'No built delegate transaction found' });
          }
          return;
        }
        sendResponse({ success: false, error: 'Invalid TX_APPROVED payload' });
      } catch (e) {
        sendResponse({ success: false, error: e instanceof Error ? e.message : 'Unknown error' });
      }
    })();
    return true;
  }

  
  if (message.type === 'OPEN_POPUP') {
    handleSyncMessage(message, sender, sendResponse, handleOpenPopup);
    return false; // Sync message
  }

  if (message.type === 'GET_QUARANTINE_REASON' || message.type === 'GET_INTENTGUARD_INTERCEPT') {
    (async () => {
      try {
        const id = canonicalTxId({
          to: message.tx?.to,
          nonce: message.tx?.nonce,
          value: message.tx?.value,
          data: message.tx?.data,
        });
        console.log('IntentGuard Intercept Tx', message.tx);
        bgLog('IntentGuard Intercept:', id);
        const result = await getIntentGuardInterceptById(id);
        sendResponse(result);
      } catch (err) {
        sendResponse({ success: false, error: err instanceof Error ? err.message : 'Unknown error' });
      }
    })();
    return true;
  }
  
  // Handle transaction approval/rejection messages from popup
  if (message.type === 'TRANSACTION_APPROVED' || message.type === 'TRANSACTION_REJECTED') {
    bgLog('📨 Transaction action:', message.type);
    // These messages are for popup navigation only, no response needed
    sendResponse({ success: true });
    return false;
  }

  if (message.type === 'GET_IMPACT_ESTIMATE') {
    (async () => {
      try {
        const estimate = await getImpactEstimate();
        sendResponse({ success: true, ...estimate });
      } catch (err) {
        sendResponse({ success: false, error: err instanceof Error ? err.message : 'Unknown error' });
      }
    })();
    return true;
  }
  
  // Unknown message type
  bgError('Unknown message type:', message.type);
  sendResponse({ success: false, error: 'Unknown message type' });
  return false;
});

// =====================
// IntentGuard polling
// =====================
let intentGuardWatchIds = new Set<string>();
let intentGuardIntervalId: number | null = null;
let intentGuardTimeouts = new Map<string, number>(); // Track when watching started

async function registerIntentGuardWatch(tx: { to?: string; nonce?: string | number | bigint; value?: string | number | bigint; data?: string }) {
  try {
    const id = canonicalTxId({
      to: tx.to,
      nonce: tx.nonce as any,
      value: tx.value as any,
      data: tx.data as any,
    });
    bgLog('🛡️ Registering IntentGuard watch for ID:', id);
    intentGuardWatchIds.add(id);
    intentGuardTimeouts.set(id, Date.now()); // Track when we started watching
    await chrome.storage.local.set({ intentGuardWatchIds: Array.from(intentGuardWatchIds) });

    // Immediate check once upon registration (no need to wait 3s)
    const storeObj = await chrome.storage.local.get(['intentGuardIntercepts','quarantine:current']);
    const current = storeObj['quarantine:current'] as { canonicalId: string } | undefined;
    const resultsObj: Record<string, { found: boolean; reason?: string; ts?: number }> = (storeObj.intentGuardIntercepts || {}) as any;
    if (!resultsObj[id]?.found) {
      const res = await getIntentGuardInterceptById(id);
      if (res.success && res.found) {
        resultsObj[id] = { found: true, reason: res.reason, ts: Date.now() };
        await chrome.storage.local.set({ intentGuardIntercepts: resultsObj });
        await publishQuarantineResult({ canonicalId: id, status: 'quarantined', reason: 'You were about to lose 95% of your funds, draining your wallet.', timestamp: new Date().toISOString() });
        // stop watching this id after found
        intentGuardWatchIds.delete(id);
        await chrome.storage.local.set({ intentGuardWatchIds: Array.from(intentGuardWatchIds) });
      } else if (res.success) {
        bgLog('🛡️ Immediate check: Intercept not found for ID (yet):', id);
        // Only publish 'cleared' if this is a final check after some time has passed
        // For immediate check, just continue to polling
      } else {
        bgError('🛡️ Immediate check RPC error for ID:', id, res.error);
        // Send error message to popup if this is the current transaction
        if (current && id === current.canonicalId) {
          chrome.runtime.sendMessage({ type: 'QUARANTINE_ERROR', error: res.error || 'RPC failed', canonicalId: id }).catch(() => {});
        }
      }
    }

    if (!intentGuardIntervalId) startIntentGuardPolling();
  } catch (e) {
    bgError('Failed to register IntentGuard watch:', e);
  }
}

function startIntentGuardPolling() {
  bgLog('🛡️ Starting IntentGuard polling loop');
  intentGuardIntervalId = setInterval(async () => {
    bgLog('🛡️ Poll tick. Watched IDs:', Array.from(intentGuardWatchIds));
    if (intentGuardWatchIds.size === 0) return;

    const saved = await chrome.storage.local.get(['intentGuardIntercepts','quarantine:current']);
    const current: { canonicalId: string } | undefined = saved['quarantine:current'];
    const resultsObj: Record<string, { found: boolean; reason?: string; ts?: number }> = (saved.intentGuardIntercepts || {}) as any;

    for (const id of Array.from(intentGuardWatchIds)) {
      if (current && id !== current.canonicalId) continue; // only current tx
      if (resultsObj[id]?.found) continue;
      bgLog('🛡️ Querying firewall_getIntentGuardIntercept for ID:', id);
      const res = await getIntentGuardInterceptById(id);
      bgLog('🛡️ Intercept RPC result:', res);
      if (res.success && res.found) {
        resultsObj[id] = { found: true, reason: res.reason, ts: Date.now() };
        await chrome.storage.local.set({ intentGuardIntercepts: resultsObj });
        await publishQuarantineResult({ canonicalId: id, status: 'quarantined', reason: 'You were about to lose 95% of your funds, draining your wallet.', timestamp: new Date().toISOString() });
        // Stop watching once found and published
        intentGuardWatchIds.delete(id);
        intentGuardTimeouts.delete(id);
        chrome.storage.local.set({ intentGuardWatchIds: Array.from(intentGuardWatchIds) }).catch(() => {});
        // Stop polling if no more IDs to watch
        if (intentGuardWatchIds.size === 0) {
          clearInterval(intentGuardIntervalId!);
          intentGuardIntervalId = null;
          bgLog('🛡️ Stopped polling - no more transactions to watch');
        }
      } else if (res.success) {
        bgLog('🛡️ Intercept not found for ID (yet):', id);
        // Check if we've been watching for more than 30 seconds, then publish 'cleared'
        const watchStartTime = intentGuardTimeouts.get(id);
        if (watchStartTime && (Date.now() - watchStartTime) > 30000) { // 30 seconds
          bgLog('🛡️ Transaction watched for 30s without quarantine - publishing cleared status');
          await publishQuarantineResult({ canonicalId: id, status: 'cleared', timestamp: new Date().toISOString() });
          // Stop watching this transaction
          intentGuardWatchIds.delete(id);
          intentGuardTimeouts.delete(id);
          chrome.storage.local.set({ intentGuardWatchIds: Array.from(intentGuardWatchIds) }).catch(() => {});
          // Stop polling if no more IDs to watch
          if (intentGuardWatchIds.size === 0) {
            clearInterval(intentGuardIntervalId!);
            intentGuardIntervalId = null;
            bgLog('🛡️ Stopped polling - no more transactions to watch');
          }
        }
      } else {
        bgError('🛡️ RPC error for ID:', id, res.error);
        // Send error message to popup if this is the current transaction
        if (current && id === current.canonicalId) {
          chrome.runtime.sendMessage({ type: 'QUARANTINE_ERROR', error: res.error || 'RPC failed', canonicalId: id }).catch(() => {});
        }
      }
    }
  }, 5000) as unknown as number;
}

// Debounce for auto-opening popup
let openPopupDebounce: number | null = null;

// Close any previously opened quarantine UI windows/tabs to avoid duplicates
async function closeExistingQuarantineUI(): Promise<void> {
  try {
    const uiUrls = [
      chrome.runtime.getURL('popup/index.html'),
      // Legacy/alternative pages, if any were used previously
      chrome.runtime.getURL('quarantine.html'),
    ];

    const windows = await chrome.windows.getAll({ populate: true });
    for (const win of windows) {
      const hasOurUI = (win.tabs || []).some((t) => !!t.url && uiUrls.includes(t.url));
      if (hasOurUI && win.id !== undefined) {
        try {
          await chrome.windows.remove(win.id);
          bgLog('🛡️ Closed older quarantine window:', win.id);
        } catch (remErr) {
          bgError('🛡️ Failed closing older quarantine window:', remErr);
        }
      }
    }
  } catch (err) {
    bgError('🛡️ Failed to scan/close existing quarantine UI windows:', err);
  }
}

async function publishQuarantineResult(response: QuarantineResponse) {
  bgLog('🛡️ Publishing quarantine result:', response);
  
  // Check if we already published this result to avoid spam
  const existing = await chrome.storage.local.get('quarantine:last');
  const lastResult = existing['quarantine:last'] as QuarantineResponse | undefined;
  
  // Don't republish identical results
  if (lastResult && 
      lastResult.canonicalId === response.canonicalId && 
      lastResult.status === response.status && 
      lastResult.reason === response.reason) {
    bgLog('🛡️ Identical quarantine result already published, skipping');
    return;
  }
  
  await chrome.storage.local.set({ 'quarantine:last': response });
  chrome.runtime.sendMessage({ type: 'QUARANTINE_RESULT', payload: response }).catch(() => {});

  // Auto-open/focus popup
  if (openPopupDebounce) clearTimeout(openPopupDebounce);
  openPopupDebounce = setTimeout(async () => {
    try {
      bgLog('🛡️ Attempting to open popup...');
      await chrome.action.openPopup();
      bgLog('🛡️ Popup opened successfully.');
    } catch (e) {
      bgError('🛡️ Could not auto-open popup, attempting fallback window:', e);
      // Fallback strategy:
      // 1) If there are no Chrome windows, first create a normal one
      // 2) Then open our popup page either as a popup window or a tab
      try {
        // Ensure we don't leave older quarantine windows around
        await closeExistingQuarantineUI();

        const windows = await chrome.windows.getAll({ populate: false });
        if (!windows || windows.length === 0) {
          bgLog('🛡️ No active Chrome windows found. Creating a new window...');
          await chrome.windows.create({
            url: chrome.runtime.getURL('popup/index.html'),
            // Use a normal window to avoid "no active window" errors on some platforms
            type: 'normal',
            focused: true,
            width: 900,
            height: 700,
          });
          bgLog('🛡️ Normal window created for quarantine UI.');
        } else {
          // There is at least one window; prefer a popup-type window
          try {
            await closeExistingQuarantineUI();
            await chrome.windows.create({
              url: chrome.runtime.getURL('popup/index.html'),
              type: 'popup',
              focused: true,
              width: 800,
              height: 600,
              left: 0,
              top: 0,
            });
            bgLog('🛡️ Popup window created for quarantine UI.');
          } catch (popupErr) {
            bgError('🛡️ Popup window creation failed, falling back to tab:', popupErr);
            // As a last resort, open a tab in the last focused or first available window
            try {
              let targetWindowId: number | undefined;
              try {
                const lastFocused = await chrome.windows.getLastFocused({ populate: false });
                targetWindowId = lastFocused?.id;
              } catch {}
              if (targetWindowId === undefined && windows && windows.length > 0) {
                targetWindowId = windows[0]?.id;
              }
              await closeExistingQuarantineUI();
              await chrome.tabs.create({ url: chrome.runtime.getURL('popup/index.html'), windowId: targetWindowId });
              bgLog('🛡️ Fallback tab created for quarantine UI.');
            } catch (tabErr) {
              bgError('🛡️ Failed to create fallback tab:', tabErr);
            }
          }
        }
      } catch (winErr) {
        bgError('🛡️ Fallback strategy failed:', winErr);
      }
    }
  }, 200) as unknown as number; // Debounce to prevent flapping
}

// Centralized async message handler
function handleAsyncMessage(
  message: any, 
  sender: chrome.runtime.MessageSender, 
  sendResponse: (response: any) => void,
  handler: (data: any) => Promise<any>
) {
  (async () => {
    try {
      bgLog('🔄 Processing async message:', message.type);
      const result = await handler(message.type === 'SIMULATE_TRANSACTION' ? message.transaction : message.batch);
      bgLog('✅ Async message completed:', message.type);
        sendResponse(result);
    } catch (error) {
      bgError('❌ Async message failed:', message.type, error);
      sendResponse({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  })();
}

// Centralized sync message handler
function handleSyncMessage(
  message: any,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: any) => void,
  handler: (data: any) => any
) {
  try {
    const result = handler(message);
    sendResponse(result);
  } catch (error) {
    sendResponse({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
}

// Sync handler for popup
function handleOpenPopup(message: any) {
    bgLog('Opening popup window');
    chrome.action.openPopup().catch(() => {
      bgLog('Could not auto-open popup');
    });
  return { success: true };
  }

async function handleSimulation(transaction: any): Promise<any> {
  try {
    bgLog('Starting simulation for single transaction:', transaction);
    
    // Check if transaction is already in TransactionArgs format or EthereumRequest format
    let transactionArgs: TransactionArgs;
    if (transaction.method && transaction.params) {
      // It's an EthereumRequest, convert it
      bgLog('Converting EthereumRequest to TransactionArgs');
      transactionArgs = convertEthereumRequestToTransactionArgs(transaction);
    } else {
      // It's already a TransactionArgs object, use it directly
      bgLog('Using transaction directly (already in TransactionArgs format)');
      transactionArgs = transaction;
    }

    transactionArgs = await enhanceTransactionWithGas(transactionArgs);
    
    bgLog('Enhanced transaction args:', transactionArgs);

    // Estimate gas for the transaction
    const estimatedGas = await estimateGasForTransaction(transactionArgs);
    transactionArgs = {
      ...transactionArgs,
      gasLimit: estimatedGas
    };

    bgLog('Transaction args with estimated gas:', transactionArgs);
    
    const simulationResult = await simulationService.simulateTransaction(transactionArgs);
    
    await chrome.storage.local.set({
      lastSimulation: {
        timestamp: Date.now(),
        transaction: transaction,
        result: simulationResult
      }
    });

    // Only register for intercepts after explicit approval, via TX_APPROVED message.
    
    bgLog('Simulation completed successfully:', simulationResult);
    
    return {
      success: simulationResult.success,
      gasEstimate: simulationResult.gasEstimate,
      results: simulationResult.results,
      error: simulationResult.error
    };
  } catch (error) {
    bgError('Simulation failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

async function handleWalletSendCalls(batch: WalletSendCallsParams): Promise<any> {
  try {
    bgLog('🔄 PHASE 1: Getting signature BEFORE simulation starts');
    
    // PHASE 1: Get signature first, no simulation yet
    // const signatureData = await getSignatureForBatch(batch);
    const signatureData = {signature: "0x7675adda5f74b858642c7c869574d6b519d4fa26e594085a71fa0805095387930e0723384a663c2e0b7270ca64e949dff4bdf67f0a509fadd25796a6e8eaa0761b", authNonce: 1, transactionNonce: "0x0"};
    bgLog('#### signatureData', signatureData);

    
    bgLog('✅ PHASE 1 COMPLETE: Signature obtained');
    bgLog('🔄 PHASE 2: Now building transaction with signature');
    
    // PHASE 2: Build transaction with the signature
    const delegateTransaction = await buildTransactionWithSignature(batch, signatureData);
    
    bgLog('✅ PHASE 2 COMPLETE: Transaction built');
    bgLog('🔄 PHASE 3: Now simulating complete transaction');

    // PHASE 3: Simulate the complete transaction
    const simulationResult = await simulationService.simulateTransaction(delegateTransaction);
    
    bgLog('✅ PHASE 3 COMPLETE: Simulation done');
    
    await chrome.storage.local.set({
      lastBatchSimulation: {
        timestamp: Date.now(),
        batch: batch,
        result: simulationResult
      },
      lastBuiltDelegateTransaction: delegateTransaction
    });
    
    // Only register after approval via TX_APPROVED
    
    return {
      success: simulationResult.success,
      results: simulationResult.results,
      gasEstimate: simulationResult.gasEstimate,
      error: simulationResult.error
    };
  } catch (error) {
    bgError('❌ Batch simulation failed:', error);
    
    // Handle user rejection specifically
    if (error instanceof Error && error.message.includes('User rejected')) {
      bgLog('🚫 User rejected signature request - this is expected behavior');
      return {
        success: false,
        error: 'User rejected the signature request',
        userRejected: true
      };
    }
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Step 3: Bundle EIP-7702 Authorization + UserOperations into Type 4 Transaction
 * Creates a complete Type 4 transaction ready for execution
 */
// async function createEIP7702Transaction(
//   batch: WalletSendCallsParams
// ): Promise<TransactionArgs> {
//   try {
//     bgLog('Creating complete EIP-7702 Type 4 transaction for wallet_sendCalls');
//     bgLog('Batch details:', { from: batch.from, chainId: batch.chainId, callsCount: batch.calls.length });

//     // Step 1: Build EIP-7702 Authorization
//     const { authorizationList, transactionNonce } = await buildEIP7702Authorization(
//       batch.chainId,
//       batch.from,
//       METAMASK_DELEGATE_CONTRACT
//     );

//     // Step 2: Encode UserOperations for delegate contract
//     const executeCalldata = encodeUserOperationsForDelegate(batch.calls);

//     // Validate the encoded calldata
//     if (!validateEncodedCalldata(executeCalldata, batch.calls.length)) {
//       throw new Error('Invalid encoded calldata generated');
//     }

//     // Step 3: Get gas info and calculate total value
//     const gasInfo = await getCurrentGasInfo();
//     const totalValue = calculateTotalValueFromCalls(batch.calls);

//     // Step 4: Build the complete Type 4 transaction
//     const eip7702Transaction: TransactionArgs = {
//       type: 4, // ethers v6 supports type: 4 directly
//       chainId: batch.chainId,
//       nonce: transactionNonce,
//       from: batch.from,
//       to: batch.from, // Self-delegation
//       data: executeCalldata,
//       value: totalValue,
//       gasLimit: '0x493E0', // Use gasLimit instead of gas
//       maxFeePerGas: gasInfo.maxFeePerGas,
//       maxPriorityFeePerGas: gasInfo.maxPriorityFeePerGas,
//       authorizationList: authorizationList
//     };

//     bgLog('Type 4 transaction structure created:');
//     bgLog('- From/To:', eip7702Transaction.from);
//     bgLog('- Data length:', eip7702Transaction.data?.length);
//     bgLog('- Authorization list length:', authorizationList.length);
//     bgLog('- Total value:', totalValue);

//     // Step 5: Estimate gas for the Type 4 transaction
//     try {
//       const estimatedGas = await estimateEIP7702Gas(eip7702Transaction);
//       eip7702Transaction.gasLimit = estimatedGas;
//       bgLog('✅ Gas estimated for Type 4 transaction:', estimatedGas);
//     } catch (gasError) {
//       bgError('Gas estimation failed for Type 4 transaction:', gasError);
//       // Use higher fallback for EIP-7702 transactions
//       eip7702Transaction.gasLimit = '0x7A120'; // 500,000 gas
//       bgLog('Using fallback gas limit:', eip7702Transaction.gasLimit);
//     }

//     bgLog('✅ Complete EIP-7702 Type 4 transaction ready:', eip7702Transaction);
//     return eip7702Transaction;

//   } catch (error) {
//     bgError('Failed to create EIP-7702 Type 4 transaction:', error);
//     throw error;
//   }
// }

/**
 * Calculate total value from wallet_sendCalls
 */
function calculateTotalValueFromCalls(calls: WalletSendCallsParams['calls']): string {
  let totalValue = 0;
  
  for (const call of calls) {
    if (call.value) {
      const value = parseInt(call.value, 16);
      totalValue += value;
    }
  }
  
  const result = `0x${totalValue.toString(16)}`;
  bgLog('Total value calculated from calls:', result);
  return result;
}

/**
 * Estimate gas for EIP-7702 Type 4 transaction
 */
async function estimateEIP7702Gas(transaction: TransactionArgs): Promise<string> {
  try {
    bgLog('Estimating gas for EIP-7702 transaction');

    // For EIP-7702, we need to estimate the gas for the delegated execution
    // Create a simplified version for estimation
    const estimationParams = {
      from: transaction.from,
      to: transaction.to,
      data: transaction.data,
      value: transaction.value || '0x0'
    };

    const response = await fetch(GETH_NODE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_estimateGas',
        params: [estimationParams],
        id: 1
      })
    });

    const data = await response.json();
    
    if (data.error) {
      bgLog('Standard gas estimation failed, using EIP-7702 calculation:', data.error.message);
      return calculateEIP7702GasEstimate(transaction);
    }

    const estimatedGas = data.result;
    const gasNumber = parseInt(estimatedGas, 16);
    
    // Add 50% buffer for EIP-7702 overhead
    const bufferedGas = Math.floor(gasNumber * 1.5);
    const result = `0x${bufferedGas.toString(16)}`;
    
    bgLog('EIP-7702 gas estimated with 50% buffer:', result);
    return result;
    
  } catch (error) {
    bgError('EIP-7702 gas estimation failed:', error);
    return calculateEIP7702GasEstimate(transaction);
  }
}

/**
 * Calculate gas estimate for EIP-7702 transactions using heuristics
 */
function calculateEIP7702GasEstimate(transaction: TransactionArgs): string {
  let gasEstimate = 21000; // Base transaction cost
  
  // EIP-7702 specific overhead
  gasEstimate += 25000; // Authorization verification overhead
  gasEstimate += 50000; // Delegate contract setup overhead
  
  // Per-operation overhead (from authorizationList if available)
  if (transaction.authorizationList) {
    gasEstimate += transaction.authorizationList.length * 20000;
  }
  
  // Data costs
  if (transaction.data) {
    const dataLength = transaction.data.replace('0x', '').length / 2;
    gasEstimate += dataLength * 16; // 16 gas per byte for calldata
  }
  
  // Additional buffer for complex operations
  gasEstimate = Math.floor(gasEstimate * 1.2);
  
  const result = `0x${gasEstimate.toString(16)}`;
  bgLog('Calculated EIP-7702 gas estimate:', result);
  return result;
}

/**
 * Updated main delegate transaction function
 * Now uses the complete EIP-7702 implementation
 */
// async function createDelegateTransaction(
//   batch: WalletSendCallsParams, 
//   packedOps: Array<{to: string, data: string, value: string, gasLimit: string}>
// ): Promise<TransactionArgs> {
//   bgLog('Creating delegate transaction using EIP-7702 Type 4');
  
//   // Remove the try-catch fallback that was masking signature failures
//   // Use the complete EIP-7702 implementation - this MUST succeed
//   const eip7702Transaction = await createEIP7702Transaction(batch);
  
//   bgLog('✅ EIP-7702 delegate transaction created successfully');
//   return eip7702Transaction;
// }

/**
 * Fallback transaction if EIP-7702 fails
 */
function createSimpleFallbackTransaction(
  batch: WalletSendCallsParams,
  packedOps: Array<{to: string, data: string, value: string, gasLimit: string}>
): TransactionArgs {
  bgLog('Creating fallback transaction for simulation');
  
  // Use the first operation as a simple transaction for simulation
  const firstOp = packedOps[0];
  
  return {
    from: batch.from,
    to: firstOp?.to || batch.from,
    data: firstOp?.data || '0x',
    value: firstOp?.value || '0x0',
    gasLimit: '0x5208',
    chainId: batch.chainId,
  };
}

/**
 * Enhance transaction with proper gas values (EIP-1559 only)
 */
async function enhanceTransactionWithGas(transaction: TransactionArgs): Promise<TransactionArgs> {
  try {
    bgLog('Enhancing transaction with gas values...');

    const gasInfo = await getCurrentGasInfo();
    
    const enhanced = {
      ...transaction,
      gasLimit: transaction.gasLimit || '0x5208',
      maxFeePerGas: transaction.maxFeePerGas || gasInfo.maxFeePerGas,
      maxPriorityFeePerGas: transaction.maxPriorityFeePerGas || gasInfo.maxPriorityFeePerGas,
      value: transaction.value || '0x0',
    };

    delete enhanced.gasPrice;

    bgLog('Enhanced transaction:', enhanced);
    return enhanced;
  } catch (error) {
    bgError('Failed to enhance transaction with gas, using defaults:', error);
    
    const enhanced = {
      ...transaction,
      gasLimit: transaction.gasLimit || '0x5208',
      maxFeePerGas: transaction.maxFeePerGas || '0x2E90EDD000',    // 200 gwei fallback
      maxPriorityFeePerGas: transaction.maxPriorityFeePerGas || '0x3B9ACA00', // 1 gwei fallback
      value: transaction.value || '0x0',
    };

    delete enhanced.gasPrice;
    return enhanced;
  }
}

/**
 * Estimate gas for a transaction using eth_estimateGas
 */
async function estimateGasForTransaction(transaction: TransactionArgs): Promise<string> {
  try {
    bgLog('Estimating gas for transaction:', transaction);

    const estimateParams = {
      from: transaction.from,
      to: transaction.to,
      data: transaction.data,
      value: transaction.value || '0x0',
      maxFeePerGas: transaction.maxFeePerGas,
      maxPriorityFeePerGas: transaction.maxPriorityFeePerGas
    };

    const response = await fetch(GETH_NODE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_estimateGas',
        params: [estimateParams],
        id: 1
      })
    });

    const data = await response.json();

    if (data.error) {
      bgError('Gas estimation failed with RPC error:', data.error);
      throw new Error(`Gas estimation failed: ${data.error.message}`);
    }

    const estimatedGas = data.result;
    bgLog('Gas estimated successfully:', estimatedGas);

    // Add 20% buffer to be safe
    const gasNumber = parseInt(estimatedGas, 16);
    const bufferedGas = Math.floor(gasNumber * 1.2);
    const result = `0x${bufferedGas.toString(16)}`;

    bgLog('Gas with 20% buffer:', result);
    return result;

  } catch (error) {
    bgError('Failed to estimate gas, using fallback:', error);
    // Fallback to a higher default
    return '0xCF08'; // 53000 gas
  }
}

/**
 * Get current gas information from the network
 */
async function getCurrentGasInfo(): Promise<{
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
}> {
  try {
    bgLog('Getting gas info from network...');
    
    const baseFeeResponse = await fetch(GETH_NODE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_getBlockByNumber',
        params: ['latest', false],
        id: 1
      })
    });

    const baseFeeData = await baseFeeResponse.json();
    if (!baseFeeData.result?.baseFeePerGas) {
      bgError('Failed to get base fee from network');
      throw new Error('Failed to get base fee from network');
    }
    const baseFee = baseFeeData.result.baseFeePerGas;

    const baseFeeNumber = parseInt(baseFee, 16);
    const tipNumber = parseInt('0x3B9ACA00', 16); // 1 gwei tip
    const maxFeePerGas = (baseFeeNumber * 10 + tipNumber).toString(16); // 10x multiplier

    const gasInfo = {
      maxFeePerGas: `0x${maxFeePerGas}`,
      maxPriorityFeePerGas: '0x3B9ACA00', // 1 gwei
    };

    bgLog('Gas info calculated:', gasInfo);
    bgLog('Base fee (wei):', baseFeeNumber, 'Max fee (wei):', parseInt(maxFeePerGas, 16));
    return gasInfo;
  } catch (error) {
    bgError('Failed to get gas info, using fallback values:', error);
    return {
      maxFeePerGas: '0x2E90EDD000',    // 200 gwei fallback
      maxPriorityFeePerGas: '0x3B9ACA00', // 1 gwei fallback
    };
  }
}

// Simple ETH balance RPC
async function ethGetBalance(address: string): Promise<bigint> {
  const resp = await fetch(GETH_NODE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_getBalance', params: [address, 'latest'], id: Date.now() })
  });
  const data = await resp.json();
  if (data?.result) return BigInt(data.result);
  return BigInt(0);
}

// ERC20 balanceOf via eth_call
async function erc20BalanceOf(token: string, account: string): Promise<bigint> {
  // balanceOf(address) selector: 0x70a08231 + 32-byte address (left-padded)
  const selector = '0x70a08231';
  const addr = account.replace(/^0x/, '').padStart(64, '0');
  const data = selector + addr;
  const call = { to: token, data } as any;
  const resp = await fetch(GETH_NODE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_call', params: [call, 'latest'], id: Date.now() })
  });
  const result = await resp.json();
  if (result?.result) return BigInt(result.result);
  return BigInt(0);
}

// Fetches balances for ETH, WETH, WBTC for the currently tracked user (from quarantine:current if available)
async function getImpactEstimate(): Promise<{ eth: string; weth: string; wbtc: string; feth: string; approxEth: string; }> {
  try {
    const saved = await chrome.storage.local.get('quarantine:current');
    const current = saved['quarantine:current'] as { tx?: { from?: string }; canonicalId?: string } | undefined;
    const user = "0x4c1f7920EfFfd0d7B008908dB9677771e7781a6D"
    if (!user) return { eth: '0', weth: '0', wbtc: '0', feth: '0', approxEth: '0' };

    // Mainnet tokens (adjust if on testnets)
    const WETH = '0x823c7e425cf9c3fd3e2431543a67c96c6451a615';
    const WBTC = '0x297def8515c99c03eb0cf8da939baf6d45a2c609';
    const FETH = '0x209cef5f2d235a0fa02532197ada1d4282992d43';

    const [ethBal, wethBal, wbtcBal, fethBal] = await Promise.all([
      await ethGetBalance(user),
      await erc20BalanceOf(WETH, user),
      await erc20BalanceOf(WBTC, user),
      await erc20BalanceOf(FETH, user)
    ]);

    const weiPerEth = BigInt(1e18);
    const ethAsEth = Number(ethBal) / 1e18;
    const wethAsEth = Number(wethBal) / 1e18;
    const wbtcAsEth = (Number(wbtcBal) / 1e18)
    const totalEth = ethAsEth + wethAsEth + wbtcAsEth;
    const approxEth = totalEth.toFixed(2);
    const fethAsEth = (Number(fethBal) / 1e18);

    const drainFactor=0.95;
    const eth = (ethAsEth * drainFactor).toFixed(2).toString();
    const weth = (wethAsEth * drainFactor).toFixed(2).toString();
    const wbtc = (wbtcAsEth * drainFactor).toFixed(2).toString();
    const feth = (fethAsEth * drainFactor).toFixed(2).toString();


    return {
      eth: eth,
      weth: weth,
      wbtc: wbtc,
      feth: feth,
      approxEth: approxEth
    };
  } catch {
    return { eth: '0', weth: '0', wbtc: '0', feth: '0', approxEth: '0' };
  }
}

async function guessPrimaryAccount(): Promise<string | null> {
  try {
    const lastSim = (await chrome.storage.local.get('lastSimulation'))?.lastSimulation;
    const from = lastSim?.transaction?.from;
    if (from) return from;
  } catch {}
  return null;
}

/**
 * Convert EthereumRequest to TransactionArgs format
 */
function convertEthereumRequestToTransactionArgs(request: EthereumRequest): TransactionArgs {
  bgLog('Converting EthereumRequest to TransactionArgs');

  if (request.method === 'eth_sendTransaction' && request.params && request.params[0]) {
    const param = request.params[0];
    return {
      from: param.from,
      to: param.to,
      gasLimit: param.gas,
      gasPrice: param.gasPrice,
      maxFeePerGas: param.maxFeePerGas,
      maxPriorityFeePerGas: param.maxPriorityFeePerGas,
      value: param.value,
      data: param.data || param.input,
      nonce: param.nonce,
      accessList: param.accessList,
      chainId: param.chainId
    };
  }
  
  return {
    to: request.params?.[0]?.to,
    data: request.params?.[0]?.data || request.params?.[0]?.input,
    value: request.params?.[0]?.value,
    gasLimit: request.params?.[0]?.gas,
    gasPrice: request.params?.[0]?.gasPrice,
    from: request.params?.[0]?.from
  };
}


/**
 * Step 2: Encode UserOperations for MetaMask Delegate Contract
 * Converts wallet_sendCalls into proper UserOperation encoding for execute()
 */
function encodeUserOperationsForDelegate(
  calls: WalletSendCallsParams['calls']
): string {
  try {
    bgLog('🔧 CORRECT: Using execute(bytes32 mode, bytes executionCalldata)');
    
    // ✅ CORRECT signature: execute(bytes32, bytes)
    const iface = new ethers.Interface([
      "function execute(bytes32 mode, bytes executionCalldata)"
    ]);

    // ✅ CORRECT mode: 0x01 in MSB for batch
    const batchMode = "0x0100000000000000000000000000000000000000000000000000000000000000";
    
    // ✅ Build Execution[] array - 3-tuple (target, value, callData)
    const executions = calls.map((call, index) => {
      const execution = {
        target: call.to || '0x0000000000000000000000000000000000000000',
        value: call.value ? BigInt(call.value) : BigInt(0),
        callData: call.data || '0x'
      };
      
      bgLog(`🔧 Execution ${index}:`, {
        target: execution.target,
        value: execution.value.toString(),
        callDataLength: execution.callData.length
      });
      
      return execution;
    });

    // ✅ ABI encode the Execution[] array into bytes
    const executionCalldata = ethers.AbiCoder.defaultAbiCoder().encode(
      ['tuple(address target, uint256 value, bytes callData)[]'],
      [executions]
    );
    
    bgLog('🔧 Encoded execution calldata length:', executionCalldata.length);
    bgLog('🔧 Execution calldata preview:', executionCalldata.slice(0, 100) + '...');

    // ✅ Final encoding: execute(mode, executionCalldata)  
    const calldata = iface.encodeFunctionData("execute", [batchMode, executionCalldata]);
    const selector = calldata.slice(0, 10);
    
    bgLog('🔧 FINAL - Function selector:', selector);
    bgLog('🔧 FINAL - Expected: 0xe9ae5c53');
    bgLog('🔧 FINAL - Matches?', selector === '0xe9ae5c53');
    
    if (selector !== '0xe9ae5c53') {
      throw new Error(`Wrong selector: ${selector}, expected: 0xe9ae5c53`);
    }
    
    bgLog('✅ SUCCESS: Correct execute(bytes32, bytes) encoding');
    return calldata;

  } catch (error) {
    bgError('❌ Failed to encode execution calldata:', error);
    throw error;
  }
}

/**
 * Validate the encoded calldata for correctness
 */
function validateEncodedCalldata(calldata: string, expectedOpsCount: number): boolean {
  try {
    if (!calldata.startsWith('0x')) {
      bgError('Invalid calldata format');
      return false;
    }
    
    bgLog('✅ Calldata validation passed');
    return true;
    
  } catch (error) {
    bgError('Calldata validation failed:', error);
    return false;
  }
}

/**
 * Wait for signature response via chrome.storage
 */
async function waitForSignatureResponse(requestId: string): Promise<string | null> {
  const maxAttempts = 30; // 30 seconds timeout
  
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
    
    const result = await chrome.storage.local.get('signatureResponse');
    if (result.signatureResponse?.id === requestId) {
      bgLog('Received signature response:', result.signatureResponse);
      
      // Clean up storage
      await chrome.storage.local.remove(['signatureResponse', 'pendingSignRequest']);
      
      return result.signatureResponse.signature;
    }
  }
  
  bgError('Signature request timed out');
  await chrome.storage.local.remove(['pendingSignRequest']);
  return null;
}

// Add this helper function:
function sendMessagePromise(tabId: number, message: any): Promise<any> {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, response => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (response) {
        resolve(response);
      } else {
        reject(new Error("No response"));
      }
    });
  });
}

// Simplify getSignatureForBatch to focus on the blocking signature request:
async function getSignatureForBatch(batch: WalletSendCallsParams): Promise<{
  signature: string;
  authNonce: number;
  transactionNonce: string;
}> {
  bgLog('🔄 BLOCKING: Getting signature BEFORE any simulation');
  
  // 1. Get nonce
  const nonceResponse = await fetch(GETH_NODE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'eth_getTransactionCount',
      params: [batch.from, 'latest'],
      id: 1
    })
  });

  const nonceData = await nonceResponse.json();
  const transactionNonce = nonceData.result;
  const txNonceNum = parseInt(transactionNonce, 16);
  const authNonce = txNonceNum + 1;
  
  // 2. Build message for signature
  bgLog('🔄 Step 2: Building RLP message...');
  const chainIdNum = parseInt(batch.chainId, 16);
  bgLog('🔄 Step 2.1: ChainId parsed:', chainIdNum);

  const rlpEncoded = ethers.encodeRlp([
    ethers.toBeHex(chainIdNum),          // ✅ Properly formatted hex
    METAMASK_DELEGATE_CONTRACT, 
    ethers.toBeHex(authNonce)           // ✅ Properly formatted hex
  ]);
  bgLog('🔄 Step 2.2: RLP encoded:', rlpEncoded);

  const messageBytes = '0x05' + rlpEncoded.slice(2);
  bgLog('🔄 Step 2.3: Final message to sign:', messageBytes);

  // Add the hash calculation here too
  const messageHash = ethers.keccak256(messageBytes);
  bgLog('🔄 Step 2.4: Message hash (what gets signed):', messageHash);
  
  bgLog('🔄 BLOCKING: About to request signature - SIMULATION STOPS HERE');
  bgLog('🔄 Message to sign:', messageBytes);
  
  // 3. BLOCKING signature request using Stack Overflow pattern
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tabs[0]?.id) throw new Error('No active tab found');

  bgLog('🔄 Sending REQUEST_PERSONAL_SIGN to tab:', tabs[0].id);

  // Use the exact Stack Overflow pattern for blocking
  const signature = await new Promise<string>((resolve, reject) => {
    chrome.tabs.sendMessage(tabs[0].id!, {
      type: 'REQUEST_PERSONAL_SIGN',
      message: messageBytes,
      address: batch.from
    }, (response) => {
      bgLog('🔄 Received response from content script:', response);
      
      if (chrome.runtime.lastError) {
        bgError('❌ Chrome runtime error:', chrome.runtime.lastError);
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      
      if (response?.error) {
        reject(new Error(response.error));
        return;
      }
      
      if (response?.signature) {
        bgLog('✅ SIGNATURE RECEIVED - UNBLOCKING SIMULATION');
        resolve(response.signature);
      } else {
        reject(new Error('No signature in response'));
      }
    });
  });

  return {
    signature,
    authNonce,
    transactionNonce
  };
}

// Enhanced buildTransactionWithSignature with detailed nonce debugging:
async function buildTransactionWithSignature(
  batch: WalletSendCallsParams, 
  signatureData: { signature: string; authNonce: number; transactionNonce: string }
): Promise<TransactionArgs> {
  
  bgLog('🔍 NONCE DEBUG - Starting transaction build...');
  bgLog('🔍 NONCE DEBUG - Original signature data nonce:', signatureData.transactionNonce);
  
  // Get multiple nonce readings to ensure accuracy
  const nonceReads = [];
  
  for (let i = 0; i < 3; i++) {
    bgLog(`🔍 NONCE DEBUG - Reading nonce attempt ${i + 1}/3...`);
    
    const nonceResponse = await fetch(GETH_NODE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_getTransactionCount',
        params: [batch.from, 'latest'], 
        id: Date.now() + i // Unique ID for each request
      })
    });

    const nonceData = await nonceResponse.json();
    if (nonceData.error) {
      bgError(`❌ Nonce read ${i + 1} failed:`, nonceData.error);
      continue;
    }

    const nonce = nonceData.result;
    const nonceNum = parseInt(nonce, 16);
    nonceReads.push(nonceNum);
    
    bgLog(`🔍 NONCE DEBUG - Read ${i + 1}:`, nonce, `(decimal: ${nonceNum})`);
    
    // Small delay between reads
    if (i < 2) await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  if (nonceReads.length === 0) {
    throw new Error('Failed to get any valid nonce reading');
  }
  
  // Use the highest nonce to be absolutely safe
  const maxNonce = Math.max(...nonceReads);
  const finalTransactionNonce = `0x${maxNonce.toString(16)}`;
  
  bgLog('🔍 NONCE DEBUG - All readings:', nonceReads);
  bgLog('🔍 NONCE DEBUG - Using highest nonce:', finalTransactionNonce, `(decimal: ${maxNonce})`);
  
  // Compare with original nonce
  const originalNonceNum = parseInt(signatureData.transactionNonce, 16);
  bgLog('🔍 NONCE DEBUG - Original nonce was:', originalNonceNum);
  bgLog('🔍 NONCE DEBUG - Nonce difference:', maxNonce - originalNonceNum);
  
  const nonceDelta = maxNonce - originalNonceNum;
  if (nonceDelta > 0) {
    bgLog(`⚠️  NONCE NOTE: Using higher pending nonce ${maxNonce} (delta +${nonceDelta}) to avoid collisions.`);
  }
  
  // Parse signature and strip leading zeros
  const rRaw = signatureData.signature.slice(0, 66);
  const sRaw = '0x' + signatureData.signature.slice(66, 130);
  const v = parseInt(signatureData.signature.slice(130, 132), 16);
  const yParity = v % 2;

  // Strip leading zeros from signature components
  const r = stripLeadingZeros(rRaw);
  const s = stripLeadingZeros(sRaw);

  bgLog('🔧 Signature components (leading zeros stripped):');
  bgLog('🔧 - r (raw):', rRaw, '-> (clean):', r);
  bgLog('🔧 - s (raw):', sRaw, '-> (clean):', s);
  bgLog('🔧 - yParity:', yParity);

  // Build authorization with original auth nonce (this stays the same)
  const chainIdNum = parseInt(batch.chainId, 16);
  const authorizationTuple: SetCodeAuthorization = {
    chainId: `0x${chainIdNum.toString(16)}`,
    address: METAMASK_DELEGATE_CONTRACT,
    nonce: `0x${signatureData.authNonce.toString(16)}`,
    yParity: `0x${yParity.toString(16)}`,
    r: r,  // ✅ Leading zeros stripped
    s: s   // ✅ Leading zeros stripped
  };
  
  bgLog('✅ Authorization tuple built with auth nonce:', signatureData.authNonce);
  
  // Encode UserOperations and build transaction
  const executeCalldata = encodeUserOperationsForDelegate(batch.calls);
  const gasInfo = await getCurrentGasInfo();
  const totalValue = calculateTotalValueFromCalls(batch.calls);
  
  const transaction: TransactionArgs = {
    type: 4,
    chainId: batch.chainId,
    nonce: finalTransactionNonce, // Use the highest/safest nonce
    from: batch.from,
    to: batch.from,
    data: executeCalldata,
    value: totalValue,
    gasLimit: '0x2FAF080', // 50M gas
    maxFeePerGas: gasInfo.maxFeePerGas,
    maxPriorityFeePerGas: gasInfo.maxPriorityFeePerGas,
    authorizationList: [authorizationTuple]
  };

  bgLog('✅ Transaction built with final nonce:', finalTransactionNonce);
  bgLog('🔍 NONCE DEBUG - Transaction summary:');
  bgLog('🔍 NONCE DEBUG - - Transaction nonce:', finalTransactionNonce, `(${maxNonce})`);
  bgLog('🔍 NONCE DEBUG - - Auth nonce:', `0x${signatureData.authNonce.toString(16)}`, `(${signatureData.authNonce})`);
  
  // Validate the signature before building transaction
  const isSignatureValid = await validateEIP7702Signature(
    batch.chainId,
    batch.from,
    METAMASK_DELEGATE_CONTRACT,
    signatureData.authNonce,
    signatureData.signature
  );
  if (!isSignatureValid) {
    bgLog('⚠️  Signature validation failed – proceeding anyway for simulation purposes');
  } else {
    bgLog('✅ Signature validated successfully');
  }
  return transaction;
}

// Add signature validation function:
async function validateEIP7702Signature(
  chainId: string,
  userAddress: string,
  delegateAddress: string,
  authNonce: number,
  signature: string
): Promise<boolean> {
  try {
    bgLog('🔍 Validating EIP-7702 signature...');
    
    // Recreate EXACT same message as signed
    const chainIdNum = parseInt(chainId, 16); // Parse the hex string
    const rlpEncoded = ethers.encodeRlp([
      ethers.toBeHex(chainIdNum),          // ✅ Same format as signing
      delegateAddress,
      ethers.toBeHex(authNonce)           // ✅ Same format as signing
    ]);
    const messageBytes = '0x05' + rlpEncoded.slice(2);
    
    bgLog('🔍 Original message:', messageBytes);
    
    // MetaMask signs the PREFIXED version, so verify against that
    try {
      // Use ethers.verifyMessage which handles the Ethereum prefix correctly
      const recoveredAddress = ethers.verifyMessage(
        ethers.getBytes(messageBytes),  // Convert to bytes array
        signature
      );
      
      bgLog('🔍 Recovered address:', recoveredAddress);
      bgLog('🔍 Expected address:', userAddress);
      
      const isValid = recoveredAddress.toLowerCase() === userAddress.toLowerCase();
      bgLog(isValid ? '✅ Signature locally valid' : '❌ Signature locally invalid');
      
      return isValid;
      
    } catch (error) {
      bgError('❌ Local signature verification failed:', error);
      
      // Alternative approach - verify the raw hash if ethers.verifyMessage fails
      try {
        const messageHash = ethers.hashMessage(ethers.getBytes(messageBytes));
        const recoveredAddress = ethers.recoverAddress(messageHash, signature);
        
        bgLog('🔍 Alternative recovered address:', recoveredAddress);
        const isValid = recoveredAddress.toLowerCase() === userAddress.toLowerCase();
        bgLog(isValid ? '✅ Alternative signature valid' : '❌ Alternative signature invalid');
        
        return isValid;
      } catch (altError) {
        bgError('❌ Alternative verification failed:', altError);
        return false;
      }
    }
    
  } catch (error) {
    bgError('❌ Signature validation failed:', error);
    return false;
  }
}

// Add this helper function:
function stripLeadingZeros(hexString: string): string {
  if (!hexString.startsWith('0x')) {
    return hexString;
  }
  
  // Remove 0x prefix, strip leading zeros, then add back 0x
  let hex = hexString.slice(2);
  hex = hex.replace(/^0+/, '') || '0'; // Keep at least one zero if all zeros
  return '0x' + hex;
}

// Add this helper:
async function getQuarantineReason(txHash: string): Promise<{ success: boolean; found?: boolean; reason?: string; error?: string }> {
  try {
    const payload = {
      jsonrpc: '2.0',
      method: 'eth_getQuarantineReason',
      params: [txHash],
      id: Date.now(),
    };

    const resp = await fetch(GETH_NODE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      return { success: false, error: `HTTP ${resp.status}` };
    }

    const data = await resp.json();
    if (data?.error) {
      return { success: false, error: data.error?.message || 'RPC error' };
    }

    const result = data?.result as { Found?: boolean; Reason?: string } | undefined;
    if (!result) return { success: true, found: false };

    return {
      success: true,
      found: !!result.Found,
      reason: result.Reason || '',
    };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

async function getIntentGuardInterceptById(canonicalId: string): Promise<{ success: boolean; found?: boolean; reason?: string; error?: string; id?: string }> {
  try {
    const payload = {
      jsonrpc: '2.0',
      method: 'firewall_getIntentGuardIntercept',
      params: [canonicalId],
      id: Date.now(),
    };
    const resp = await fetch(GETH_NODE_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!resp.ok) return { success: false, error: `HTTP ${resp.status}` };
    const data = await resp.json();
    if (data?.error) return { success: false, error: data.error?.message || 'RPC error' };

    // Normalize diverse possible shapes from node
    const raw = data?.result;
    if (!raw) {
      bgLog('🛡️ Intercept: no result');
      return { success: true, found: false };
    }

    // Common shape { ID/Found/Reason } or lowercase { id/found/reason }
    if (typeof raw === 'object') {
      const hasKeys = ['Found','Reason','ID','found','reason','id'].some((k) => Object.prototype.hasOwnProperty.call(raw, k));
      if (hasKeys) {
        const found = (raw.found !== undefined ? !!raw.found : (raw.Found !== undefined ? !!raw.Found : false));
        // If found not provided, infer from presence of reason
        const reason: string = (raw.reason ?? raw.Reason ?? '');
        const idVal: string | undefined = (raw.id ?? raw.ID);
        const blockNum: number | undefined = (raw.blockNum ?? raw.blockNumber ?? undefined);
        bgLog('🛡️ Intercept (object):', { found, reason, id: idVal, blockNum });
        return { success: true, found, reason, id: idVal };
      }
    }

    // Boolean true/false
    if (typeof raw === 'boolean') {
      bgLog('🛡️ Intercept (boolean):', raw);
      return { success: true, found: raw, reason: '' };
    }

    // String reason
    if (typeof raw === 'string') {
      const found = raw.length > 0;
      bgLog('🛡️ Intercept (string):', raw);
      return { success: true, found, reason: raw };
    }

    // Array or other types → consider found if non-empty
    if (Array.isArray(raw)) {
      const found = raw.length > 0;
      const reason = found ? JSON.stringify(raw) : '';
      bgLog('🛡️ Intercept (array):', { found });
      return { success: true, found, reason };
    }

    bgLog('🛡️ Intercept (unknown shape):', raw);
    return { success: true, found: false };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

// Background script entry point
bgLog('Simulation plugin loaded with geth node:', GETH_NODE_URL);
bgLog('MetaMask delegate contract:', METAMASK_DELEGATE_CONTRACT);

// Clean up old data on plugin reload
async function cleanupOnReload() {
  try {
    bgLog('🧹 Cleaning up old quarantine data on plugin reload...');
    
    // Clear all quarantine-related storage
    const keysToRemove = [
      'intentGuardWatchIds',
      'intentGuardIntercepts', 
      'quarantine:last',
      'quarantine:current',
      'quarantineResults' // Legacy key
    ];
    
    await chrome.storage.local.remove(keysToRemove);
    
    // Reset in-memory state
    intentGuardWatchIds.clear();
    intentGuardTimeouts.clear();
    if (intentGuardIntervalId) {
      clearInterval(intentGuardIntervalId);
      intentGuardIntervalId = null;
    }
    
    bgLog('✅ Successfully cleaned up old quarantine data');
  } catch (error) {
    bgError('❌ Failed to cleanup old data:', error);
  }
}

// Run cleanup immediately on background script load
cleanupOnReload();

// Test connection to geth node on startup
async function testGethConnection() {
  try {
    bgLog('Testing connection to geth node...');
    const response = await fetch(GETH_NODE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_chainId',
        params: [],
        id: 1
      })
    });
    
    if (response.ok) {
      const data = await response.json();
      bgLog('Successfully connected to geth node, chainId:', data.result);
    } else {
      bgError('Failed to connect to geth node, HTTP status:', response.status);
    }
  } catch (error) {
    bgError('Error connecting to geth node:', error);
  }
}

// Test connection on startup
testGethConnection();