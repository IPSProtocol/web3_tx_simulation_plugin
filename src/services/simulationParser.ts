import { SimBlockResult, SimCallResult, ContractEvents,   CallError } from '../types/simulation_interfaces';

export class EventAnalyzer {
  
  /**
   * Parses and analyzes FullTransactionEvents from simulation results
   */
  parseTransactionEvents(results: SimBlockResult[]): ParsedSimulationResult[] {
    const parsedResults: ParsedSimulationResult[] = [];

    for (const blockResult of results) {
      const blockEvents: ParsedBlockResult = {
        blockNumber: blockResult.number,
        blockHash: blockResult.hash,
        transactions: [],
      };

      for (let i = 0; i < blockResult.calls.length; i++) {
        const call = blockResult.calls[i];
        const transactionEvents = this.parseTransactionCall(call, i);
        blockEvents.transactions.push(transactionEvents);
      }

      parsedResults.push(blockEvents);
    }

    return parsedResults;
  }

  private parseTransactionCall(call: SimCallResult, txIndex: number): ParsedTransactionResult {
    const result: ParsedTransactionResult = {
      transactionIndex: txIndex,
      gasUsed: call.gasUsed,
      status: call.status,
      success: call.status === "0x1",
      error: call.error,
      events: [],
      eventsByContract: new Map(),
    };

    // Parse FullTransactionEvents
    if (call.fullTransactionEvents?.eventsByContract) {
      for (const contractEvents of call.fullTransactionEvents.eventsByContract) {
        const parsedEvent = this.parseContractEvent(contractEvents);
        result.events.push(parsedEvent);
        
        // Group by contract
        if (!result.eventsByContract.has(contractEvents.address)) {
          result.eventsByContract.set(contractEvents.address, []);
        }
        result.eventsByContract.get(contractEvents.address)!.push(parsedEvent);
      }
    }

    return result;
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
    // This would typically use a library like ethers.js or web3.js for ABI decoding
    // For now, return basic parameter info
    return parameters.map((param, index) => ({
      index,
      type: "bytes32", // Default - would need ABI for proper typing
      value: param,
      decodedValue: null, // Would decode based on type
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