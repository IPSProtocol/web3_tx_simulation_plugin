// ===== INPUT INTERFACES =====

export interface TransactionArgs {
  type?: number;
  from?: string;
  to?: string;
  gasLimit?: string;
  gasPrice?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  value?: string;
  nonce?: string;
  data?: string;
  input?: string;
  accessList?: AccessListItem[];
  chainId?: string;
  maxFeePerBlobGas?: string;
  blobVersionedHashes?: string[];
  authorizationList?: SetCodeAuthorization[];
}

export interface AccessListItem {
  address: string;
  storageKeys: string[];
}

export interface SetCodeAuthorization {
  chainId: string;
  address: string;
  nonce: string;
  yParity: string;  // Changed from 'v' to 'yParity'
  r: string;
  s: string;
}

export interface BlockOverrides {
  number?: string;
  difficulty?: string;
  time?: string;
  gasLimit?: string;
  feeRecipient?: string;
  prevRandao?: string;
  baseFeePerGas?: string;
  blobBaseFee?: string;
}

export interface OverrideAccount {
  nonce?: string;
  code?: string;
  balance?: string;
  state?: Record<string, string>;
  stateDiff?: Record<string, string>;
  movePrecompileToAddress?: string;
}

export type StateOverride = Record<string, OverrideAccount>;

export interface SimBlock {
  blockOverrides?: BlockOverrides;
  stateOverrides?: StateOverride;
  calls: TransactionArgs[];
}

export interface SimulationOptions {
  blockStateCalls: SimBlock[];
  traceTransfers: boolean;
  validation: boolean;
  returnFullTransactions: boolean;
}

// ===== OUTPUT INTERFACES =====

export interface EventData {
  eventSigHash: string;
  parameters: string[];
}

export interface ContractEvents {
  address: string;
  contractEvents: EventData;
}

export interface FullTransactionEvents {
  eventsByContract: ContractEvents[];
}

export interface CallError {
  message: string;
  code: number;
  data?: string;
}

export interface SimCallResult {
  returnData: string;
  logs: LogEntry[];
  fullTransactionEvents: FullTransactionEvents;
  gasUsed: string;
  status: string;
  error?: CallError;
}

export interface LogEntry {
  address: string;
  topics: string[];
  data: string;
  blockNumber?: string;
  transactionHash?: string;
  transactionIndex?: string;
  blockHash?: string;
  logIndex?: string;
  removed?: boolean;
}

export interface SimBlockResult {
  number: string;
  hash: string;
  parentHash: string;
  gasLimit: string;
  gasUsed: string;
  timestamp: string;
  transactions: any[];
  calls: SimCallResult[];
}


// ===== PARSED INTERFACES =====

export interface ParsedEvent {
  contractAddress: string;
  eventSignature: string;
  parameters: string[];
  decodedEventName: string | null;
  parametersDecoded: DecodedParameter[] | null;
}

export interface DecodedParameter {
  index: number;
  type: string;
  value: string;
  decodedValue: any;
}

export interface ParsedTransactionResult {
  transactionIndex: number;
  gasUsed: string;
  status: string;
  success: boolean;
  error?: CallError;
  events: ParsedEvent[];
  eventsByContract: Map<string, ParsedEvent[]>;
}

export interface ParsedBlockResult {
  blockNumber: string;
  blockHash: string;
  transactions: ParsedTransactionResult[];
}

export type ParsedSimulationResult = ParsedBlockResult;

// ===== LEGACY COMPATIBILITY INTERFACES =====
// For backward compatibility during transition

export interface EventContext {
  eventName: string;
  contractAddress: string;
  caller: string;
  parameters: any[];
}

// Updated BatchSimulationResult to use new data structures
export interface BatchSimulationResult {
  success: boolean;
  error?: string;
  results: ParsedSimulationResult[];
  gasEstimate?: number;
}

export interface EventParameter {
  name: string;
  value: string;
  type: string;
}

// ===== RPC CALL INPUT PARAMETERS =====

/**
 * Main parameter structure for eth_simulateV1IPSP RPC call
 * Maps directly to Go's simOpts struct
 */
export interface SimulateV1IPSPParams {
  blockStateCalls: SimBlockCall[];
  traceTransfers: boolean;
  validation: boolean;
  returnFullTransactions: boolean;
}

/**
 * Individual simulation block structure
 * Maps directly to Go's simBlock struct
 */
export interface SimBlockCall {
  blockOverrides?: BlockOverrides;
  stateOverrides?: StateOverride;
  calls: TransactionArgs[];
}

/**
 * Block number or hash parameter (second parameter of the RPC call)
 */
export type BlockNumberOrHash = string | {
  blockNumber?: string;
  blockHash?: string;
  requireCanonical?: boolean;
};

/**
 * Complete RPC call parameter structure
 */
export interface SimulateV1IPSPRequest {
  jsonrpc: "2.0";
  method: "eth_simulateV1IPSP";
  params: [SimulateV1IPSPParams, BlockNumberOrHash?];
  id: number | string;
}

// ===== BACKGROUND SCRIPT INTERFACES =====

/**
 * Ethereum request format (for individual transactions)
 */
export interface EthereumRequest {
  method: string;
  params: any[];
}

/**
 * Wallet send calls parameters (for batch transactions)
 */
export interface WalletSendCallsParams {
  version: string;
  chainId: string;
  from: string;
  calls: {
    to?: string;
    data?: string;
    value?: string;
    gas?: string;
    gasPrice?: string;
    maxFeePerGas?: string;
    maxPriorityFeePerGas?: string;
  }[];
}

export interface SimulationResponse {
  results: SimBlockResult[];
  error: string;
  success: boolean;
}

export interface StorageData {
  lastSimulation: any;
  lastBatchSimulation: any;
  pendingTransactions: TransactionArgs[];
  simulationResult: any;
}