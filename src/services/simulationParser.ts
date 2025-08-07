import { SimBlockResult, SimCallResult, ContractEvents, CallError } from '../types/simulation_interfaces';

// Event signatures to filter out (gas-related and validator events)
const FILTERED_EVENT_SIGNATURES = new Set([
  '0xed620e74005ef5b6859a850d3371a1c2363c06aea619dd9d62dbd50e77175344', // ETH Transfer for gas payment to validator
  '0xbcf852bd5973413005fcca294c13b8104b16f51c288a60710ca8ec990d5076f4', // ETH decrease (gas-related)
  '0x0d17a004887fb911f81bd40baddcdba0a0df2c6270be1da65b89239f89ab8f89'  // Gas-related event
]);

// Contract addresses to filter out completely (ALL LOWERCASE)
const FILTERED_ADDRESSES = new Set([
  '0x750344a99df9cb624448bd24af2723d28f67aadb' // Filter all events from this address
]);

// Token addresses for transfer consolidation (ALL LOWERCASE)
const CONSOLIDATION_TOKENS = new Set([
  '0x823c7e425cf9c3fd3e2431543a67c96c6451a615'.toLowerCase(),
  '0x209cef5f2d235a0fa02532197ada1d4282992d43'.toLowerCase(), 
  '0x297def8515c99c03eb0cf8da939baf6d45a2c609'.toLowerCase()
]);

// Transfer event signature
const TRANSFER_EVENT_SIG = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

export class EventAnalyzer {
  
  constructor() {
    console.log('EventAnalyzer initialized with filtered signatures:', Array.from(FILTERED_EVENT_SIGNATURES));
    console.log('EventAnalyzer initialized with filtered addresses:', Array.from(FILTERED_ADDRESSES));
    console.log('EventAnalyzer initialized with consolidation tokens:', Array.from(CONSOLIDATION_TOKENS));
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
   * Check if an address should be filtered out completely
   */
  private shouldFilterAddress(address: string): boolean {
    const normalizedAddress = address.toLowerCase();
    const shouldFilter = FILTERED_ADDRESSES.has(normalizedAddress);
    console.log(`🔍 Address filter check: ${address} (normalized: ${normalizedAddress}) → ${shouldFilter ? 'FILTER OUT' : 'KEEP'}`);
    if (shouldFilter) {
      console.log('✗ FILTERING OUT all events from address:', address);
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

  // Add user account detection - we'll determine this from the transaction context
  private getUserAccount(events: ParsedEvent[]): string | null {
    // Try to identify the user account from Transfer events
    const fromAddresses = new Map<string, number>();
    
    for (const event of events) {
      if (event.eventSignature === TRANSFER_EVENT_SIG && event.parametersDecoded?.[0]) {
        const fromAddr = event.parametersDecoded[0].decodedValue?.toLowerCase();
        if (fromAddr && fromAddr !== '0x0000000000000000000000000000000000000000') {
          fromAddresses.set(fromAddr, (fromAddresses.get(fromAddr) || 0) + 1);
        }
      }
    }
    
    // Return the most frequent 'from' address as likely user account
    let maxCount = 0;
    let userAccount = null;
    fromAddresses.forEach((count, addr) => {
      if (count > maxCount) {
        maxCount = count;
        userAccount = addr;
      }
    });
    
    console.log('🔍 Detected user account:', userAccount);
    return userAccount;
  }

  /**
   * Check if an event involves the user account
   */
  private eventInvolvestUser(event: ParsedEvent, userAccount: string): boolean {
    if (event.eventSignature === TRANSFER_EVENT_SIG && event.parametersDecoded && event.parametersDecoded.length >= 2) {
      const fromAddr = event.parametersDecoded[0]?.decodedValue?.toLowerCase();
      const toAddr = event.parametersDecoded[1]?.decodedValue?.toLowerCase();
      const involves = fromAddr === userAccount.toLowerCase() || toAddr === userAccount.toLowerCase();
      console.log(`🔍 Transfer event involves user (${userAccount}): ${involves} (from: ${fromAddr}, to: ${toAddr})`);
      return involves;
    }
    
    if (event.eventSignature === '0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925') { // Approval
      const ownerAddr = event.parametersDecoded?.[0]?.decodedValue?.toLowerCase();
      const involves = ownerAddr === userAccount.toLowerCase();
      console.log(`🔍 Approval event involves user (${userAccount}): ${involves} (owner: ${ownerAddr})`);
      return involves;
    }
    
    // For other events, check if user address appears in any parameter
    if (event.parametersDecoded) {
      for (const param of event.parametersDecoded) {
        if (param.type === 'address' && param.decodedValue?.toLowerCase() === userAccount.toLowerCase()) {
          console.log(`🔍 Event involves user in parameter:`, param);
          return true;
        }
      }
    }
    
    return false;
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
    const rawEvents: ParsedEvent[] = [];

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
          
          // Skip filtered event signatures
          if (this.shouldFilterEvent(eventSignature)) {
            console.log(`✗ FILTERED OUT Event ${i}: ${eventSignature} from ${address}`);
            continue;
          }

          // Skip filtered addresses
          if (this.shouldFilterAddress(address)) {
            console.log(`✗ FILTERED OUT Event ${i}: from filtered address ${address}`);
            continue;
          }

          console.log(`✓ KEEPING Event ${i}: ${eventSignature} from ${address}`);

          // Create unique key to avoid duplicates
          const eventKey = `${contractEvents.address}-${eventSignature}-${JSON.stringify(contractEvents.contractEvents.parameters)}`;
          
          if (!processedEvents.has(eventKey)) {
            const parsedEvent = this.parseContractEvent(contractEvents);
            rawEvents.push(parsedEvent);
            processedEvents.add(eventKey);
            console.log(`✓ ADDED Event ${i} to raw events. Total raw events now: ${rawEvents.length}`);
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

          // Skip filtered addresses
          if (this.shouldFilterAddress(log.address)) {
            console.log('Filtering out event from address:', log.address);
            continue;
          }

          const parsedEvent = this.parseLogEntry(log);
          rawEvents.push(parsedEvent);
        } catch (error) {
          console.warn('Failed to parse log entry:', error, log);
        }
      }
    }

    // Detect user account and filter events
    const userAccount = this.getUserAccount(rawEvents);
    if (userAccount) {
      console.log(`🔍 Filtering events to only show those involving user: ${userAccount}`);
      const userEvents = rawEvents.filter(event => this.eventInvolvestUser(event, userAccount));
      console.log(`🔍 Filtered from ${rawEvents.length} to ${userEvents.length} user-relevant events`);
      
      // Consolidate Transfer events for specified tokens
      const consolidatedEvents = this.consolidateTransferEvents(userEvents, userAccount);
      
      // Add consolidated events to result
      for (const event of consolidatedEvents) {
        result.events.push(event);
        
        // Group by contract
        if (!result.eventsByContract.has(event.contractAddress)) {
          result.eventsByContract.set(event.contractAddress, []);
        }
        result.eventsByContract.get(event.contractAddress)!.push(event);
      }
    } else {
      console.log('⚠️ Could not detect user account, showing all events');
      const consolidatedEvents = this.consolidateTransferEvents(rawEvents);
      
      for (const event of consolidatedEvents) {
        result.events.push(event);
        if (!result.eventsByContract.has(event.contractAddress)) {
          result.eventsByContract.set(event.contractAddress, []);
        }
        result.eventsByContract.get(event.contractAddress)!.push(event);
      }
    }

    console.log('=== FINAL PARSING RESULT ===');
    console.log('Total events after filtering and consolidation:', result.events.length);
    result.events.forEach((event, index) => {
      console.log(`Final Event ${index}: ${event.decodedEventName || 'Unknown'} - ${event.eventSignature} from ${event.contractAddress}`);
    });
    console.log('Events by contract:', result.eventsByContract);
    console.log('=== END PARSING RESULT ===');
    
    return result;
  }

  /**
   * Consolidate Transfer events for the same user on the same token
   */
  private consolidateTransferEvents(events: ParsedEvent[], userAccount?: string): ParsedEvent[] {
    console.log('🔄 Starting Transfer event consolidation...');
    console.log('🔄 Input events:', events.length);
    
    // Separate Transfer events from other events
    const transferEvents = events.filter(e => {
      const isTransfer = e.eventSignature === TRANSFER_EVENT_SIG;
      const isConsolidationToken = CONSOLIDATION_TOKENS.has(e.contractAddress.toLowerCase());
      console.log(`🔄 Event check: ${e.contractAddress} → Transfer: ${isTransfer}, ConsolidationToken: ${isConsolidationToken}`);
      return isTransfer && isConsolidationToken;
    });
    
    const otherEvents = events.filter(e => 
      !(e.eventSignature === TRANSFER_EVENT_SIG && 
        CONSOLIDATION_TOKENS.has(e.contractAddress.toLowerCase()))
    );

    console.log(`🔄 Found ${transferEvents.length} Transfer events to consolidate, ${otherEvents.length} other events`);

    if (transferEvents.length === 0) {
      return events; // No transfers to consolidate
    }

    // Group transfers by token and user
    const transfersByTokenUser = new Map<string, { 
      incoming: bigint, 
      outgoing: bigint, 
      events: ParsedEvent[],
      lastFromAddr: string,
      lastToAddr: string
    }>();

    for (const event of transferEvents) {
      if (!event.parametersDecoded || event.parametersDecoded.length < 3) {
        console.warn('⚠️ Skipping Transfer event with insufficient parameters:', event);
        continue;
      }

      const fromAddress = event.parametersDecoded[0].decodedValue?.toLowerCase();
      const toAddress = event.parametersDecoded[1].decodedValue?.toLowerCase();
      const amount = BigInt(event.parametersDecoded[2].value);

      console.log(`🔄 Processing Transfer: ${amount} from ${fromAddress} to ${toAddress} on ${event.contractAddress}`);

      // Only consolidate if user account is involved
      if (userAccount) {
        const userLower = userAccount.toLowerCase();
        if (fromAddress !== userLower && toAddress !== userLower) {
          console.log(`🔄 Skipping transfer that doesn't involve user account`);
          continue;
        }
        
        const key = `${event.contractAddress.toLowerCase()}-${userLower}`;
        
        if (!transfersByTokenUser.has(key)) {
          transfersByTokenUser.set(key, { 
            incoming: BigInt(0), 
            outgoing: BigInt(0), 
            events: [],
            lastFromAddr: '',
            lastToAddr: ''
          });
        }

        const consolidation = transfersByTokenUser.get(key)!;
        consolidation.events.push(event);

        if (fromAddress === userLower) {
          consolidation.outgoing += amount;
          consolidation.lastFromAddr = fromAddress;
          console.log(`🔄 Added ${amount} to outgoing for ${userAccount} on ${event.contractAddress}`);
        }
        if (toAddress === userLower) {
          consolidation.incoming += amount;
          consolidation.lastToAddr = toAddress;
          console.log(`🔄 Added ${amount} to incoming for ${userAccount} on ${event.contractAddress}`);
        }
      }
    }

    // Create consolidated events
    const consolidatedTransfers: ParsedEvent[] = [];
    
    transfersByTokenUser.forEach((consolidation, key) => {
      const [contractAddress, userAddressLower] = key.split('-');
      const netChange = consolidation.incoming - consolidation.outgoing;
      
      console.log(`🔄 Consolidating for ${userAddressLower} on ${contractAddress}: incoming=${consolidation.incoming}, outgoing=${consolidation.outgoing}, net=${netChange}`);

      if (netChange !== BigInt(0)) {
        // For consolidated transfers, we need to find representative counterparties
        // instead of using 0x0000... addresses
        
        let representativeFrom = '';
        let representativeTo = '';
        
        if (netChange > 0) {
          // User received net tokens - find who they received the most from
          const senders = new Map<string, bigint>();
          for (const evt of consolidation.events) {
            if (evt.parametersDecoded && evt.parametersDecoded.length >= 2) {
              const from = evt.parametersDecoded[0].decodedValue?.toLowerCase();
              const to = evt.parametersDecoded[1].decodedValue?.toLowerCase();
              const amount = BigInt(evt.parametersDecoded[2].value);
              
              if (to === userAddressLower && from && from !== userAddressLower) {
                senders.set(from, (senders.get(from) || BigInt(0)) + amount);
              }
            }
          }
          
          // Find the biggest sender
          let maxAmount = BigInt(0);
          senders.forEach((amount, sender) => {
            if (amount > maxAmount) {
              maxAmount = amount;
              representativeFrom = sender;
            }
          });
          
          representativeTo = userAddressLower;
        } else {
          // User sent net tokens - find who they sent the most to
          const recipients = new Map<string, bigint>();
          for (const evt of consolidation.events) {
            if (evt.parametersDecoded && evt.parametersDecoded.length >= 2) {
              const from = evt.parametersDecoded[0].decodedValue?.toLowerCase();
              const to = evt.parametersDecoded[1].decodedValue?.toLowerCase();
              const amount = BigInt(evt.parametersDecoded[2].value);
              
              if (from === userAddressLower && to && to !== userAddressLower) {
                recipients.set(to, (recipients.get(to) || BigInt(0)) + amount);
              }
            }
          }
          
          // Find the biggest recipient
          let maxAmount = BigInt(0);
          recipients.forEach((amount, recipient) => {
            if (amount > maxAmount) {
              maxAmount = amount;
              representativeTo = recipient;
            }
          });
          
          representativeFrom = userAddressLower;
        }
        
        // Fallback to a more descriptive placeholder if no representative found
        if (!representativeFrom) representativeFrom = 'multiple_sources';
        if (!representativeTo) representativeTo = 'multiple_destinations';
        
        console.log(`🔄 Using representative addresses: from=${representativeFrom}, to=${representativeTo}`);
        
        // Create a consolidated transfer event
        const consolidatedEvent: ParsedEvent = {
          contractAddress,
          eventSignature: TRANSFER_EVENT_SIG,
          parameters: [
            representativeFrom === 'multiple_sources' ? '0x0000000000000000000000000000000000000001' : representativeFrom.padStart(64, '0'),
            representativeTo === 'multiple_destinations' ? '0x0000000000000000000000000000000000000002' : representativeTo.padStart(64, '0'),
            `0x${Math.abs(Number(netChange)).toString(16)}`
          ],
          decodedEventName: `Net Transfer: ${netChange > 0 ? '+' : ''}${netChange.toString()}`,
          parametersDecoded: [
            {
              index: 0,
              type: "address",
              value: representativeFrom === 'multiple_sources' ? '0x0000000000000000000000000000000000000001' : representativeFrom.padStart(64, '0'),
              decodedValue: representativeFrom === 'multiple_sources' ? 'Multiple Sources' : representativeFrom
            },
            {
              index: 1,
              type: "address", 
              value: representativeTo === 'multiple_destinations' ? '0x0000000000000000000000000000000000000002' : representativeTo.padStart(64, '0'),
              decodedValue: representativeTo === 'multiple_destinations' ? 'Multiple Destinations' : representativeTo
            },
            {
              index: 2,
              type: "uint256",
              value: `0x${Math.abs(Number(netChange)).toString(16)}`,
              decodedValue: Math.abs(Number(netChange)).toLocaleString()
            }
          ]
        };

        consolidatedTransfers.push(consolidatedEvent);
        console.log(`✅ Created consolidated Transfer for ${userAddressLower}: ${netChange}`);
      } else {
        console.log(`⚖️ Net change is zero for ${userAddressLower} on ${contractAddress}, skipping`);
      }
    });

    console.log(`🔄 Consolidation complete: ${transferEvents.length} → ${consolidatedTransfers.length} Transfer events`);
    
    return [...otherEvents, ...consolidatedTransfers];
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

    if (eventSigHash === "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925") {
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