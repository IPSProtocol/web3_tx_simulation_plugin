import { 
  EthereumRequest, 
  WalletSendCallsParams, 
  BatchSimulationResult,
  TransactionArgs
} from '../types/simulation_interfaces';
import { SimulationService } from '../services/simulationService';

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
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  bgLog('Received message:', request.type);

  if (request.type === 'SIMULATE_TRANSACTION') {
    bgLog('Processing single transaction simulation');
    handleSimulation(request.transaction)
      .then(result => {
        bgLog('Single transaction result:', result);
        sendResponse(result);
      })
      .catch(error => {
        bgError('Single transaction error:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
  
  if (request.type === 'SIMULATE_BATCH_TRANSACTION') {
    bgLog('Processing wallet_sendCalls as single delegate transaction');
    handleWalletSendCalls(request.batch)
      .then(result => {
        bgLog('wallet_sendCalls simulation result:', result);
        sendResponse(result);
      })
      .catch(error => {
        bgError('wallet_sendCalls simulation error:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
  
  if (request.type === 'OPEN_POPUP') {
    bgLog('Opening popup window');
    chrome.action.openPopup().catch(() => {
      bgLog('Could not auto-open popup');
    });
  }
});

async function handleSimulation(transaction: EthereumRequest): Promise<any> {
  try {
    bgLog('Starting simulation for single transaction:', transaction);
    
    const transactionArgs: TransactionArgs = await enhanceTransactionWithGas(
      convertEthereumRequestToTransactionArgs(transaction)
    );
    
    bgLog('Enhanced transaction args:', transactionArgs);
    
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
    bgLog('Starting wallet_sendCalls simulation');
    bgLog('Raw batch:', batch);
    bgLog('Number of calls:', batch.calls.length);
    
    // Step 1: Convert calls to PackedUserOperations
    const packedOps = batch.calls.map((call, index) => {
      const op = {
        to: call.to || '0x0000000000000000000000000000000000000000', // Fallback for undefined
        data: call.data || '0x',
        value: call.value || '0x0',
        gasLimit: call.gas || '0x5208' // 21000 default
      };
      bgLog(`PackedUserOperation ${index + 1}:`, op);
      return op;
    });
    
    // Step 2: Create the single transaction to delegate contract
    const delegateTransaction = await createDelegateTransaction(batch, packedOps);
    
    console.log('Created delegate transaction:', delegateTransaction);
    
    bgLog('Created delegate transaction:', delegateTransaction);
    
    // Step 3: Simulate ONLY this single transaction
    const simulationResult = await simulationService.simulateTransaction(delegateTransaction);
    
    bgLog('Delegate transaction simulation result:', simulationResult);
    
    await chrome.storage.local.set({
      lastBatchSimulation: {
        timestamp: Date.now(),
        batch: batch,
        result: simulationResult
      },
      pendingTransactions: [delegateTransaction]
    });
    
    bgLog('wallet_sendCalls simulation completed successfully');
    
    return {
      success: simulationResult.success,
      results: simulationResult.results,
      gasEstimate: simulationResult.gasEstimate,
      error: simulationResult.error
    };
  } catch (error) {
    bgError('wallet_sendCalls simulation failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Create the single transaction to the delegate contract
 */
async function createDelegateTransaction(
  batch: WalletSendCallsParams, 
  packedOps: Array<{to: string, data: string, value: string, gasLimit: string}>
): Promise<TransactionArgs> {
  try {
    bgLog('Creating delegate transaction for PackedUserOperations:', packedOps);
    
    // Get network gas info
    const gasInfo = await getCurrentGasInfo();
    
    // Encode the execute() function call
    const executeCallData = encodeExecuteFunction(packedOps);
    
    // Calculate total value (sum of all call values)
    const totalValue = calculateTotalValue(packedOps);
    
    // Estimate gas for this single transaction
    const estimatedGas = await estimateGasForDelegateTransaction(batch, executeCallData, totalValue);
    
    const delegateTransaction: TransactionArgs = {
      from: batch.from, // User's address
      to: METAMASK_DELEGATE_CONTRACT, // MetaMask's delegate contract
      data: executeCallData, // execute(PackedUserOperation[])
      value: totalValue, // Sum of all individual values
      gas: estimatedGas,
      maxFeePerGas: gasInfo.maxFeePerGas,
      maxPriorityFeePerGas: gasInfo.maxPriorityFeePerGas,
      chainId: batch.chainId,
    };
    
    bgLog('Delegate transaction created:', delegateTransaction);
    return delegateTransaction;
  } catch (error) {
    bgError('Failed to create delegate transaction:', error);
    throw error;
  }
}

/**
 * Encode execute((address to, bytes data, uint256 value, uint256 gasLimit)[] ops)
 */
function encodeExecuteFunction(packedOps: Array<{to: string, data: string, value: string, gasLimit: string}>): string {
  try {
    bgLog('Encoding execute() function for PackedUserOperations:', packedOps);
    
    // Function selector for execute((address,bytes,uint256,uint256)[])
    // keccak256("execute((address,bytes,uint256,uint256)[])")
    const functionSelector = '0x8dd7712f';
    
    // Start building ABI encoded data
    let encodedData = '';
    
    // Offset to the array (32 bytes from start, since it's the first parameter)
    encodedData += '0000000000000000000000000000000000000000000000000000000000000020';
    
    // Array length
    const arrayLength = packedOps.length.toString(16).padStart(64, '0');
    encodedData += arrayLength;
    
    // For each PackedUserOperation, encode the struct
    for (const op of packedOps) {
      // Clean up addresses and values
      const to = op.to.replace('0x', '').padStart(40, '0');
      const value = parseInt(op.value, 16).toString(16).padStart(64, '0');
      const gasLimit = parseInt(op.gasLimit, 16).toString(16).padStart(64, '0');
      const data = op.data.replace('0x', '');
      
      // Encode struct (address to, bytes data, uint256 value, uint256 gasLimit)
      encodedData += '000000000000000000000000' + to; // address (32 bytes)
      encodedData += '0000000000000000000000000000000000000000000000000000000000000080'; // data offset (4 * 32 = 128 = 0x80)
      encodedData += value; // value (32 bytes)
      encodedData += gasLimit; // gasLimit (32 bytes)
      
      // Encode bytes data
      const dataLength = (data.length / 2).toString(16).padStart(64, '0');
      encodedData += dataLength; // data length
      encodedData += data; // actual data
      
      // Pad to 32-byte boundary
      if (data.length % 64 !== 0) {
        encodedData += '0'.repeat(64 - (data.length % 64));
      }
    }
    
    const fullCallData = functionSelector + encodedData;
    bgLog('Encoded execute() function call data:', fullCallData);
    return fullCallData;
    
  } catch (error) {
    bgError('Failed to encode execute() function, using fallback:', error);
    // Simple fallback - just call the first operation directly
    return packedOps[0]?.data || '0x';
  }
}

/**
 * Calculate total value from all PackedUserOperations
 */
function calculateTotalValue(packedOps: Array<{value: string}>): string {
  let totalValue = 0;
  
  for (const op of packedOps) {
    const value = parseInt(op.value, 16);
    totalValue += value;
  }
  
  const result = `0x${totalValue.toString(16)}`;
  bgLog('Total value calculated:', result, 'from operations:', packedOps.map(op => op.value));
  return result;
}

/**
 * Estimate gas for the delegate transaction
 */
async function estimateGasForDelegateTransaction(
  batch: WalletSendCallsParams, 
  callData: string, 
  value: string
): Promise<string> {
  bgLog('Using calculated gas estimate (skipping network call)');
  
  // Fallback calculation
  let gasEstimate = 21000; // Base transaction cost
  gasEstimate += 50000; // Delegate contract overhead
  gasEstimate += batch.calls.length * 30000; // Per-call overhead
  
  // Add data costs
  const dataLength = callData.replace('0x', '').length / 2;
  gasEstimate += dataLength * 68; // Gas per byte of calldata
  
  const result = `0x${gasEstimate.toString(16)}`;
  bgLog('Calculated gas estimate:', result);
  return result;
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
      gas: transaction.gas || '0x5208',
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
      gas: transaction.gas || '0x5208',
      maxFeePerGas: transaction.maxFeePerGas || '0x5D21DBA00',
      maxPriorityFeePerGas: transaction.maxPriorityFeePerGas || '0x3B9ACA00',
      value: transaction.value || '0x0',
    };

    delete enhanced.gasPrice;
    return enhanced;
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
    const baseFee = baseFeeData.result?.baseFeePerGas || '0x3B9ACA00';

    const baseFeeNumber = parseInt(baseFee, 16);
    const tipNumber = parseInt('0x3B9ACA00', 16);
    const maxFeePerGas = (baseFeeNumber * 2 + tipNumber).toString(16);

    const gasInfo = {
      maxFeePerGas: `0x${maxFeePerGas}`,
      maxPriorityFeePerGas: '0x3B9ACA00',
    };

    bgLog('Gas info calculated:', gasInfo);
    return gasInfo;
  } catch (error) {
    bgError('Failed to get gas info, using fallback values:', error);
    return {
      maxFeePerGas: '0x5D21DBA00',
      maxPriorityFeePerGas: '0x3B9ACA00',
    };
  }
}

/**
 * Convert EthereumRequest to TransactionArgs format
 */
function convertEthereumRequestToTransactionArgs(request: EthereumRequest): TransactionArgs {
  if (request.method === 'eth_sendTransaction' && request.params && request.params[0]) {
    const param = request.params[0];
    return {
      from: param.from,
      to: param.to,
      gas: param.gas,
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
    gas: request.params?.[0]?.gas,
    gasPrice: request.params?.[0]?.gasPrice,
    from: request.params?.[0]?.from
  };
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