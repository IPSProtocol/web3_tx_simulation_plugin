import {
  EthereumRequest,
  WalletSendCallsParams,
  BatchSimulationResult,
  TransactionArgs,
  SetCodeAuthorization
} from '../types/simulation_interfaces';
import { SimulationService } from '../services/simulationService';
import { ethers } from 'ethers';

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
  
  if (message.type === 'OPEN_POPUP') {
    handleSyncMessage(message, sender, sendResponse, handleOpenPopup);
    return false; // Sync message
  }
  
  // Unknown message type
  bgError('Unknown message type:', message.type);
  sendResponse({ success: false, error: 'Unknown message type' });
  return false;
});

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
      },
      pendingTransactions: [transactionArgs]
    });

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
    const signatureData = await getSignatureForBatch(batch);
    
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
      pendingTransactions: [delegateTransaction]
    });

    return {
      success: simulationResult.success,
      results: simulationResult.results,
      gasEstimate: simulationResult.gasEstimate,
      error: simulationResult.error
    };
  } catch (error) {
    bgError('❌ Batch simulation failed:', error);
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
async function createEIP7702Transaction(
  batch: WalletSendCallsParams
): Promise<TransactionArgs> {
  try {
    bgLog('Creating complete EIP-7702 Type 4 transaction for wallet_sendCalls');
    bgLog('Batch details:', { from: batch.from, chainId: batch.chainId, callsCount: batch.calls.length });

    // Step 1: Build EIP-7702 Authorization
    const { authorizationList, transactionNonce } = await buildEIP7702Authorization(
      batch.chainId,
      batch.from,
      METAMASK_DELEGATE_CONTRACT
    );

    // Step 2: Encode UserOperations for delegate contract
    const executeCalldata = encodeUserOperationsForDelegate(batch.calls);

    // Validate the encoded calldata
    if (!validateEncodedCalldata(executeCalldata, batch.calls.length)) {
      throw new Error('Invalid encoded calldata generated');
    }

    // Step 3: Get gas info and calculate total value
    const gasInfo = await getCurrentGasInfo();
    const totalValue = calculateTotalValueFromCalls(batch.calls);

    // Step 4: Build the complete Type 4 transaction
    const eip7702Transaction: TransactionArgs = {
      type: 4, // ethers v6 supports type: 4 directly
      chainId: batch.chainId,
      nonce: transactionNonce,
      from: batch.from,
      to: batch.from, // Self-delegation
      data: executeCalldata,
      value: totalValue,
      gasLimit: '0x493E0', // Use gasLimit instead of gas
      maxFeePerGas: gasInfo.maxFeePerGas,
      maxPriorityFeePerGas: gasInfo.maxPriorityFeePerGas,
      authorizationList: authorizationList
    };

    bgLog('Type 4 transaction structure created:');
    bgLog('- From/To:', eip7702Transaction.from);
    bgLog('- Data length:', eip7702Transaction.data?.length);
    bgLog('- Authorization list length:', authorizationList.length);
    bgLog('- Total value:', totalValue);

    // Step 5: Estimate gas for the Type 4 transaction
    try {
      const estimatedGas = await estimateEIP7702Gas(eip7702Transaction);
      eip7702Transaction.gasLimit = estimatedGas;
      bgLog('✅ Gas estimated for Type 4 transaction:', estimatedGas);
    } catch (gasError) {
      bgError('Gas estimation failed for Type 4 transaction:', gasError);
      // Use higher fallback for EIP-7702 transactions
      eip7702Transaction.gasLimit = '0x7A120'; // 500,000 gas
      bgLog('Using fallback gas limit:', eip7702Transaction.gasLimit);
    }

    bgLog('✅ Complete EIP-7702 Type 4 transaction ready:', eip7702Transaction);
    return eip7702Transaction;

  } catch (error) {
    bgError('Failed to create EIP-7702 Type 4 transaction:', error);
    throw error;
  }
}

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
async function createDelegateTransaction(
  batch: WalletSendCallsParams, 
  packedOps: Array<{to: string, data: string, value: string, gasLimit: string}>
): Promise<TransactionArgs> {
  bgLog('Creating delegate transaction using EIP-7702 Type 4');
  
  // Remove the try-catch fallback that was masking signature failures
  // Use the complete EIP-7702 implementation - this MUST succeed
  const eip7702Transaction = await createEIP7702Transaction(batch);
  
  bgLog('✅ EIP-7702 delegate transaction created successfully');
  return eip7702Transaction;
}

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
 * Step 1: Build EIP-7702 Authorization for Type 4 Transaction
 * Creates the authorization tuple needed for delegating to MetaMask's contract
 */
async function buildEIP7702Authorization(
  chainId: string,
  userAddress: string,
  delegateAddress: string
): Promise<{
  authorizationList: SetCodeAuthorization[];
  transactionNonce: string;
}> {
  try {
    bgLog('Building EIP-7702 authorization for user:', userAddress);
    
    // 1. Get the user's current transaction nonce
    const nonceResponse = await fetch(GETH_NODE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_getTransactionCount',
        params: [userAddress, 'latest'],
        id: 1
      })
    });

    const nonceData = await nonceResponse.json();
    if (nonceData.error) {
      throw new Error(`Failed to get nonce: ${nonceData.error.message}`);
    }

    const transactionNonce = nonceData.result;
    const txNonceNum = parseInt(transactionNonce, 16);
    
    // 2. Calculate auth nonce (txNonce + 1 since EOA broadcasts itself)
    const authNonce = txNonceNum + 1;
    
    bgLog('Transaction nonce:', transactionNonce, 'Auth nonce:', authNonce);

    // 3. Compute EIP-7702 native hash: keccak256(0x05 || RLP([chain_id, contract_address, nonce]))
    const chainIdNum = parseInt(chainId, 16);
    
    // RLP encode [chain_id, contract_address, nonce]
    const rlpEncoded = ethers.encodeRlp([
      chainId,                         // Use original chainId string directly  
      delegateAddress,                 // Address is already proper format
      ethers.toBeHex(authNonce)       // Use ethers.toBeHex for nonce
    ]);
    
    // Create the message with 0x05 prefix
    const messageBytes = '0x05' + rlpEncoded.slice(2);
    
    bgLog('RLP encoded data:', rlpEncoded);
    bgLog('Message bytes with 0x05 prefix:', messageBytes);

    bgLog('🔄 BLOCKING: Requesting signature from user for message:', messageBytes);
    bgLog('🔄 BLOCKING: Simulation STOPPED until signature received');

    let signature: string;
    try {
      // Create a bulletproof Promise that MUST complete
      signature = await new Promise<string>((resolve, reject) => {
        bgLog('🔄 Creating signature promise...');
        
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (!tabs[0]?.id) {
            bgError('❌ No active tab found');
            reject(new Error('No active tab found'));
            return;
          }

          bgLog('🔄 Sending signature request to tab:', tabs[0].id);

          chrome.tabs.sendMessage(tabs[0].id, {
            type: 'REQUEST_PERSONAL_SIGN',
            message: messageBytes,
            address: userAddress
          }, (response) => {
            bgLog('🔄 Raw signature response received:', response);
            
            if (chrome.runtime.lastError) {
              bgError('❌ Chrome runtime error:', chrome.runtime.lastError);
              reject(new Error(`Message failed: ${chrome.runtime.lastError.message}`));
              return;
            }

            if (!response) {
              bgError('❌ No response received');
              reject(new Error('No response received from content script'));
              return;
            }

            if (response.error) {
              bgError('❌ Signature error:', response.error);
              reject(new Error(`Signature failed: ${response.error}`));
              return;
            }

            if (!response.signature) {
              bgError('❌ No signature in response');
              reject(new Error('No signature received from user'));
              return;
            }

            bgLog('✅ SIGNATURE RECEIVED:', response.signature);
            resolve(response.signature);
          });
        });
      });
      
      bgLog('✅ BLOCKING COMPLETE: Signature obtained, continuing simulation...');
      
    } catch (error) {
      bgError('❌ SIGNATURE FAILED - STOPPING SIMULATION:', error);
      throw new Error(`Signature request failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Verify signature exists before proceeding
    if (!signature || signature.length < 132) {
      bgError('❌ Invalid signature length:', signature?.length);
      throw new Error('Invalid signature received');
    }

    // 5. Parse signature to get r, s, v and convert to yParity
    const r = signature.slice(0, 66); // 0x + 64 chars
    const s = '0x' + signature.slice(66, 130); // next 64 chars  
    const v = parseInt(signature.slice(130, 132), 16); // last 2 chars
    const yParity = v % 2;

    bgLog('Parsed signature - r:', r, 's:', s, 'v:', v, 'yParity:', yParity);

    // 6. Build authorization tuple [chainId, address, nonce, yParity, r, s]
    const authorizationTuple: SetCodeAuthorization = {
      chainId: `0x${chainIdNum.toString(16)}`,
      address: delegateAddress,
      nonce: `0x${authNonce.toString(16)}`,
      yParity: `0x${yParity.toString(16)}`,
      r: r,
      s: s
    };

    const authorizationList = [authorizationTuple];

    bgLog('Authorization tuple created:', authorizationTuple);
    bgLog('✅ Authorization tuple built:', authorizationTuple);
    bgLog('- chainId:', authorizationTuple.chainId);
    bgLog('- address:', authorizationTuple.address);  
    bgLog('- nonce:', authorizationTuple.nonce);
    bgLog('- yParity:', authorizationTuple.yParity);
    bgLog('- r:', authorizationTuple.r);
    bgLog('- s:', authorizationTuple.s);

    return {
      authorizationList,
      transactionNonce
    };

  } catch (error) {
    bgError('Failed to build EIP-7702 authorization:', error);
    throw error;
  }
}

/**
 * Step 2: Encode UserOperations for MetaMask Delegate Contract
 * Converts wallet_sendCalls into proper UserOperation encoding for execute()
 */
function encodeUserOperationsForDelegate(
  calls: WalletSendCallsParams['calls']
): string {
  try {
    bgLog('Encoding UserOperations for delegate contract:', calls);

    const iface = new ethers.Interface([
      "function execute((address to,uint256 value,bytes data)[] calls)"
    ]);

    const formatted = calls.map(call => ({
      to: call.to,
      value: call.value || "0",
      data: call.data || "0x"
    }));

    const calldata = iface.encodeFunctionData("execute", [formatted]);
    bgLog('Encoded execute calldata:', calldata);
    return calldata;

  } catch (error) {
    bgError('Failed to encode UserOperations:', error);
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
  const chainIdNum = parseInt(batch.chainId, 16);
  bgLog('🔄 ChainId details:', {
    original: batch.chainId,
    parsed: chainIdNum,
    hexBack: chainIdNum.toString(16)
  });

  // Fix the RLP encoding - use proper ethers formatting
  const rlpEncoded = ethers.encodeRlp([
    batch.chainId,                    // Use original chainId string directly
    METAMASK_DELEGATE_CONTRACT,       // Address is already proper format
    ethers.toBeHex(authNonce)        // Use ethers.toBeHex for consistent formatting
  ]);

  bgLog('🔄 RLP encoded successfully:', rlpEncoded);
  const messageBytes = '0x05' + rlpEncoded.slice(2);
  
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

// Add this function before handleWalletSendCalls:
async function buildTransactionWithSignature(
  batch: WalletSendCallsParams, 
  signatureData: { signature: string; authNonce: number; transactionNonce: string }
): Promise<TransactionArgs> {
  
  // Get FRESH nonce right before building transaction
  bgLog('🔄 Getting fresh nonce for transaction...');
  const nonceResponse = await fetch(GETH_NODE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'eth_getTransactionCount',
      params: [batch.from, 'latest'], // Use 'pending' to get latest nonce
      id: 1
    })
  });

  const nonceData = await nonceResponse.json();
  if (nonceData.error) {
    throw new Error(`Failed to get fresh nonce: ${nonceData.error.message}`);
  }

  const freshTransactionNonce = nonceData.result;
  bgLog('✅ Fresh nonce obtained:', freshTransactionNonce, '(was:', signatureData.transactionNonce, ')');
  
  // Parse signature
  const r = signatureData.signature.slice(0, 66);
  const s = '0x' + signatureData.signature.slice(66, 130);
  const v = parseInt(signatureData.signature.slice(130, 132), 16);
  const yParity = v % 2;
  
  // Build authorization with original auth nonce (this stays the same)
  const chainIdNum = parseInt(batch.chainId, 16);
  const authorizationTuple: SetCodeAuthorization = {
    chainId: `0x${chainIdNum.toString(16)}`,
    address: METAMASK_DELEGATE_CONTRACT,
    nonce: `0x${signatureData.authNonce.toString(16)}`, // Keep original auth nonce
    yParity: `0x${yParity.toString(16)}`,
    r: r,
    s: s
  };
  
  bgLog('✅ Authorization tuple built:', authorizationTuple);
  
  // Encode UserOperations and build transaction
  const executeCalldata = encodeUserOperationsForDelegate(batch.calls);
  const gasInfo = await getCurrentGasInfo();
  const totalValue = calculateTotalValueFromCalls(batch.calls);
  
  const transaction: TransactionArgs = {
    type: 4,
    chainId: batch.chainId,
    nonce: freshTransactionNonce, // Use FRESH nonce here
    from: batch.from,
    to: batch.from,
    data: executeCalldata,
    value: totalValue,
    gasLimit: '0x2FAF080', // 50M gas as shown in error
    maxFeePerGas: gasInfo.maxFeePerGas,
    maxPriorityFeePerGas: gasInfo.maxPriorityFeePerGas,
    authorizationList: [authorizationTuple]
  };

  bgLog('✅ Transaction built with fresh nonce:', freshTransactionNonce);
  return transaction;
}

// Background script entry point
bgLog('Simulation plugin loaded with geth node:', GETH_NODE_URL);
bgLog('MetaMask delegate contract:', METAMASK_DELEGATE_CONTRACT);

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