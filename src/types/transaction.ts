// Parameter can be any Ethereum event parameter type
export interface EventParameter {
  name: string;
  type: string;
  value: string;
}

export interface EventContext {
  name: string;
  eventName: string;
  parameters: EventParameter[];
  contractAddress: string;
  blockNumber: number;
  transactionHash: string;
  caller: string;
}

export interface ContractEvents {
  [contractAddress: string]: EventContext[];
}

export interface SimulationResult {
  success: boolean;
  gasEstimate: string;
  events: ContractEvents;
  error?: string;
}

export interface EthereumRequest {
  method: string;
  params: any[];
}

export interface EventEmissionContext {
  contractAddress: string;
  events: EventContext[];
  msgSender: string;
  contextAddr: string;
  parameters: EventParameter[];
}

export interface StorageData {
  simulationResult: SimulationResult | null;
  lastRequest: any; // TODO: Type this properly once we know the exact shape
}

// Helper function to create a mock simulation result
export function createMockSimulationResult(): SimulationResult {
  return {
    success: true,
    gasEstimate: '50000',
    events: {
      '0x1234567890123456789012345678901234567890': [
        {
          name: 'Transfer',
          eventName: 'Transfer',
          contractAddress: '0x1234567890123456789012345678901234567890',
          blockNumber: 1234567,
          transactionHash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
          caller: '0x1234567890123456789012345678901234567890',
          parameters: [
            { name: 'from', type: 'address', value: '0x1234...' },
            { name: 'to', type: 'address', value: '0x5678...' },
            { name: 'value', type: 'uint256', value: '1000000000000000000' }
          ]
        }
      ]
    }
  };
}

// Helper type for organizing events by contract
export type EventsByContract = Map<string, EventContext[]>;

// Helper function to organize events by contract
export function organizeEventsByContract(events: EventContext[]): EventsByContract {
  return events.reduce((acc: EventsByContract, event: EventContext) => {
    const existingEvents = acc.get(event.parameters.find(p => p.name === 'contractAddress')?.value || '') || [];
    acc.set(event.parameters.find(p => p.name === 'contractAddress')?.value || '', [...existingEvents, event]);
    return acc;
  }, new Map());
}

// Example usage:
/*
const exampleEvent: EventEmissionContext = {
  msgSender: "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
  contextAddr: "0x123...", // Contract being called
  parameters: [
    {
      name: "amount",
      value: "1000000000000000000",
      type: "uint256"
    },
    {
      name: "token",
      value: "0xabc...",
      type: "address"
    }
  ]
};

const exampleContractEvents: ContractEvents = {
  contractAddress: "0xdef...",
  events: [exampleEvent]
};
*/

export const groupEventsByContract = (events: EventContext[]): ContractEvents => {
  return events.reduce((acc: ContractEvents, event: EventContext) => {
    if (!acc[event.contractAddress]) {
      acc[event.contractAddress] = [];
    }
    acc[event.contractAddress].push(event);
    return acc;
  }, {});
}; 