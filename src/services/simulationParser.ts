import { SimBlockResult, SimCallResult, ContractEvents,   CallError } from '../types/simulation_interfaces';

// Event signatures to filter out (gas-related and validator events)
const FILTERED_EVENT_SIGNATURES = new Set([
  '0xed620e74005ef5b6859a850d3371a1c2363c06aea619dd9d62dbd50e77175344', // ETH Transfer for gas payment to validator
  '0xbcf852bd5973413005fcca294c13b8104b16f51c288a60710ca8ec990d5076f4', // ETH decrease (gas-related)
  '0x0d17a004887fb911f81bd40baddcdba0a0df2c6270be1da65b89239f89ab8f89'  // Gas-related event
]);

export class EventAnalyzer {
  
  constructor() {
    console.log('EventAnalyzer initialized with filtered signatures:', Array.from(FILTERED_EVENT_SIGNATURES));
  }
  
  /**
   * Check if an event signature should be filtered out
   */
  private shouldFilterEvent(eventSignature: string): boolean {
    const shouldFilter = FILTERED_EVENT_SIGNATURES.has(eventSignature);
    console.log(`Checking filter for ${eventSignature}: ${shouldFilter ? 'FILTER' : 'KEEP'}`);
    if (shouldFilter) {
      console.log('Matched filtered signature:', eventSignature);
    }
    return shouldFilter;
  }
  
  /**
   * Parses and analyzes FullTransactionEvents from simulation results
   */
  parseTransactionEvents(results: any[]): ParsedSimulationResult[] {
    const parsedResults: ParsedSimulationResult[] = [];

    for (const blockResult of results) {
      console.log('Processing block result:', blockResult);
      
      // Handle the actual response structure
      const calls = blockResult.Calls || blockResult.calls || [];
      const receipts = blockResult.Receipts || blockResult.receipts || [];
      
      const blockEvents: ParsedBlockResult = {
        blockNumber: blockResult.Block?.number || blockResult.number || '0x0',
        blockHash: blockResult.Block?.hash || blockResult.hash || '0x0',
        transactions: [],
      };

      console.log('Found calls:', calls.length, 'receipts:', receipts.length);

      for (let i = 0; i < calls.length; i++) {
        const call = calls[i];
        const receipt = receipts[i];
        
        // Combine call data with receipt data for more complete transaction info
        const transactionEvents = this.parseTransactionCall(call, receipt, i);
        blockEvents.transactions.push(transactionEvents);
      }

      parsedResults.push(blockEvents);
    }

    return parsedResults;
  }

  private parseTransactionCall(call: any, receipt: any, txIndex: number): ParsedTransactionResult {
    console.log('Parsing call:', call);
    console.log('Parsing receipt:', receipt);
    
    const result: ParsedTransactionResult = {
      transactionIndex: txIndex,
      gasUsed: receipt?.gasUsed || call?.gasUsed || '0x0',
      status: receipt?.status || call?.status || '0x1',
      success: (receipt?.status || call?.status || '0x1') === "0x1",
      error: call?.error,
      events: [],
      eventsByContract: new Map(),
    };

    // Use Set to track processed events and avoid duplicates
    const processedEvents = new Set<string>();

    // Primary source: fullTransactionEvents from call (more structured)
    if (call?.fullTransactionEvents?.eventsByContract) {
      console.log('Processing fullTransactionEvents from call');
      console.log('Total events found:', call.fullTransactionEvents.eventsByContract.length);
      
      for (let i = 0; i < call.fullTransactionEvents.eventsByContract.length; i++) {
        const contractEvents = call.fullTransactionEvents.eventsByContract[i];
        try {
          const eventSignature = contractEvents.contractEvents.eventSigHash;
          const address = contractEvents.address;
          
          console.log(`Event ${i}: address=${address}, signature=${eventSignature}`);
          
          // Skip filtered events
          if (this.shouldFilterEvent(eventSignature)) {
            console.log(`✗ FILTERED OUT Event ${i}: ${eventSignature} from ${address}`);
            continue;
          }

          console.log(`✓ KEEPING Event ${i}: ${eventSignature} from ${address}`);

          // Create unique key to avoid duplicates
          const eventKey = `${contractEvents.address}-${eventSignature}-${JSON.stringify(contractEvents.contractEvents.parameters)}`;
          
          if (!processedEvents.has(eventKey)) {
            const parsedEvent = this.parseContractEvent(contractEvents);
            result.events.push(parsedEvent);
            
            // Group by contract
            if (!result.eventsByContract.has(contractEvents.address)) {
              result.eventsByContract.set(contractEvents.address, []);
            }
            result.eventsByContract.get(contractEvents.address)!.push(parsedEvent);
            
            processedEvents.add(eventKey);
            console.log(`✓ ADDED Event ${i} to results. Total events now: ${result.events.length}`);
          } else {
            console.log(`✗ DUPLICATE Event ${i}: already processed`);
          }
        } catch (error) {
          console.warn('Failed to parse contract event:', error, contractEvents);
        }
      }
    }

    // Fallback: Parse logs from receipt only if no fullTransactionEvents
    else if (receipt?.logs && Array.isArray(receipt.logs)) {
      console.log('Processing', receipt.logs.length, 'logs from receipt (fallback)');
      for (const log of receipt.logs) {
        try {
          const eventSignature = log.topics && log.topics.length > 0 ? log.topics[0] : '';
          
          // Skip filtered events
          if (this.shouldFilterEvent(eventSignature)) {
            console.log('Filtering out event:', eventSignature);
            continue;
          }

          const parsedEvent = this.parseLogEntry(log);
          result.events.push(parsedEvent);
          
          // Group by contract
          if (!result.eventsByContract.has(log.address)) {
            result.eventsByContract.set(log.address, []);
          }
          result.eventsByContract.get(log.address)!.push(parsedEvent);
        } catch (error) {
          console.warn('Failed to parse log entry:', error, log);
        }
      }
    }

    console.log('=== FINAL PARSING RESULT ===');
    console.log('Total events after filtering:', result.events.length);
    result.events.forEach((event, index) => {
      console.log(`Final Event ${index}: ${event.decodedEventName || 'Unknown'} - ${event.eventSignature} from ${event.contractAddress}`);
    });
    console.log('Events by contract:', result.eventsByContract);
    console.log('=== END PARSING RESULT ===');
    
    return result;
  }

  private parseLogEntry(log: any): ParsedEvent {
    // Extract the event signature from the first topic (if available)
    const eventSignature = log.topics && log.topics.length > 0 ? log.topics[0] : '';
    
    // For log entries, parameters are typically in topics[1:] and data
    const parameters: string[] = [];
    if (log.topics && log.topics.length > 1) {
      parameters.push(...log.topics.slice(1));
    }
    if (log.data && log.data !== '0x') {
      parameters.push(log.data);
    }
    
    return {
      contractAddress: log.address || '',
      eventSignature: eventSignature,
      parameters: parameters,
      decodedEventName: this.tryDecodeEventName(eventSignature),
      parametersDecoded: this.tryDecodeParameters(eventSignature, parameters),
    };
  }

  private parseContractEvent(contractEvents: ContractEvents): ParsedEvent {
    return {
      contractAddress: contractEvents.address,
      eventSignature: contractEvents.contractEvents.eventSigHash,
      parameters: contractEvents.contractEvents.parameters,
      decodedEventName: this.tryDecodeEventName(contractEvents.contractEvents.eventSigHash),
      parametersDecoded: this.tryDecodeParameters(
        contractEvents.contractEvents.eventSigHash,
        contractEvents.contractEvents.parameters
      ),
    };
  }

  private tryDecodeEventName(eventSigHash: string): string | null {
    // Common event signatures - extend this mapping
    const knownEvents: Record<string, string> = {
      "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef": "Transfer(address,address,uint256)",
      "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925": "Approval(address,address,uint256)",
      "0xe1fffcc4923d04b559f4d29a8bfc6cda04eb5b0d3c460751c2402c5c5cc9109c": "Deposit(address,uint256)",
      "0x7fcf532c15f0a6db0bd6d0e038bea71d30d808c7d98cb3bf7268a95bf5081b65": "Withdrawal(address,uint256)",
    };

    return knownEvents[eventSigHash] || null;
  }

  private tryDecodeParameters(eventSigHash: string, parameters: string[]): DecodedParameter[] | null {
    // Enhanced decoding for common events
    if (eventSigHash === "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef") {
      // Transfer(address,address,uint256) event
      return parameters.map((param, index) => {
        switch (index) {
          case 0: // from address
          case 1: // to address
            return {
              index,
              type: "address",
              value: param,
              decodedValue: `0x${param.slice(-40)}`, // Extract address from padded hex
            };
          case 2: // amount
            return {
              index,
              type: "uint256",
              value: param,
              decodedValue: parseInt(param, 16).toLocaleString(), // Convert to readable number
            };
          default:
            return {
              index,
              type: "bytes32",
              value: param,
              decodedValue: null,
            };
        }
      });
    }

    // Default decoding for other events
    return parameters.map((param, index) => ({
      index,
      type: "bytes32",
      value: param,
      decodedValue: null,
    }));
  }
}

// Additional interfaces for parsed results
interface ParsedEvent {
  contractAddress: string;
  eventSignature: string;
  parameters: string[];
  decodedEventName: string | null;
  parametersDecoded: DecodedParameter[] | null;
}

interface DecodedParameter {
  index: number;
  type: string;
  value: string;
  decodedValue: any;
}

interface ParsedTransactionResult {
  transactionIndex: number;
  gasUsed: string;
  status: string;
  success: boolean;
  error?: CallError;
  events: ParsedEvent[];
  eventsByContract: Map<string, ParsedEvent[]>;
}

interface ParsedBlockResult {
  blockNumber: string;
  blockHash: string;
  transactions: ParsedTransactionResult[];
}

type ParsedSimulationResult = ParsedBlockResult;