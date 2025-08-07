import { SimulationOptions, SimulationResponse, SimulateV1IPSPParams, BlockNumberOrHash, SimulateV1IPSPRequest, TransactionArgs, BlockOverrides, StateOverride } from '../types/simulation_interfaces';


export class SimulationApiClient {
  private rpcUrl: string;
  private requestId: number = 1;

  constructor(rpcUrl: string) {
    this.rpcUrl = rpcUrl;
  }

  /**
 * Get current base fee from latest block
 */
  async getBaseFee(): Promise<string> {
    const payload = {
      jsonrpc: "2.0",
      method: "eth_getBlockByNumber",
      params: ["latest", false],
      id: this.requestId++,
    };

    const response = await fetch(this.rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    return data.result?.baseFeePerGas || "0x0";
  }

  /**
   * Get suggested priority fee
   */
  async getSuggestedPriorityFee(): Promise<string> {
    const payload = {
      jsonrpc: "2.0",
      method: "eth_maxPriorityFeePerGas",
      params: [],
      id: this.requestId++,
    };

    const response = await fetch(this.rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    return data.result || "0x3B9ACA00"; // fallback to 1 gwei
  }

  /**
   * SimulateV1IPSP with proper error handling
   */
  async simulateV1IPSP(
    params: SimulateV1IPSPParams,
    blockNumberOrHash?: BlockNumberOrHash
  ): Promise<SimulationResponse> {

    const request: SimulateV1IPSPRequest = {
      jsonrpc: "2.0",
      method: "eth_simulateV1IPSP",
      params: [params, blockNumberOrHash || "latest"],
      id: this.requestId++,
    };

    try {
      const response = await fetch(this.rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log('json data json string:', data);
      if (data.error) {
        return {
          results: [],
          error: this.parseErrorMessage(data.error),
          success: false,
        };
      }

      return {
        results: data.result || [],
        error: "",
        success: true,
      };
    } catch (error) {
      return {
        results: [],
        error: error instanceof Error ? error.message : "Unknown error",
        success: false,
      };
    }
  }

  /**
   * Parse and format error messages for better debugging
   */
  private parseErrorMessage(error: any): string {
    const message = error.message || error.toString();

    // Check for common gas pricing errors
    if (message.includes("max fee per gas less than block base fee")) {
      return `Gas pricing error: The transaction's maxFeePerGas is too low. Current network base fee is higher than your specified maxFeePerGas. Please increase your gas price.`;
    }

    if (message.includes("insufficient funds")) {
      return `Insufficient balance: The account doesn't have enough ETH to cover gas fees and transaction value.`;
    }

    return message;
  }

  /**
   * Helper method to create simulation parameters easily
   */
  createSimulationParams(
    transactions: TransactionArgs[],
    options: {
      traceTransfers?: boolean;
      validation?: boolean;
      returnFullTransactions?: boolean;
      blockOverrides?: BlockOverrides;
      stateOverrides?: StateOverride;
    } = {}
  ): SimulateV1IPSPParams {
    return {
      blockStateCalls: [{
        blockOverrides: options.blockOverrides,
        stateOverrides: options.stateOverrides,
        calls: transactions
      }],
      traceTransfers: options.traceTransfers ?? true,
      validation: true,
      returnFullTransactions: options.returnFullTransactions ?? true,
    };
  }
}



/**
 * Helper class to build simulation parameters with validation
 */
export class SimulationParamsBuilder {
  private params: SimulateV1IPSPParams;

  constructor() {
    this.params = {
      blockStateCalls: [],
      traceTransfers: true,
      validation: true,
      returnFullTransactions: true,
    };
  }

  /**
   * Add a new simulation block with transactions
   */
  addBlock(
    transactions: TransactionArgs[],
    blockOverrides?: BlockOverrides,
    stateOverrides?: StateOverride
  ): SimulationParamsBuilder {
    this.params.blockStateCalls.push({
      blockOverrides,
      stateOverrides,
      calls: transactions,
    });
    return this;
  }

  /**
   * Set trace transfers flag
   */
  setTraceTransfers(trace: boolean): SimulationParamsBuilder {
    this.params.traceTransfers = trace;
    return this;
  }

  /**
   * Set validation flag
   */
  setValidation(validate: boolean): SimulationParamsBuilder {
    this.params.validation = validate;
    return this;
  }

  /**
   * Set return full transactions flag
   */
  setReturnFullTransactions(returnFull: boolean): SimulationParamsBuilder {
    this.params.returnFullTransactions = returnFull;
    return this;
  }

  /**
   * Build and validate the final parameters
   */
  build(): SimulateV1IPSPParams {
    if (this.params.blockStateCalls.length === 0) {
      throw new Error("At least one block with transactions must be added");
    }

    for (const block of this.params.blockStateCalls) {
      if (block.calls.length === 0) {
        throw new Error("Each block must contain at least one transaction");
      }
    }

    return { ...this.params };
  }

  /**
 * Get current gas information from the network
 */
  private static async getCurrentGasInfo(apiClient: SimulationApiClient): Promise<{
    maxFeePerGas: string;
    maxPriorityFeePerGas: string;
    gasPrice: string;
  }> {
    try {
      // Get current base fee and suggested gas prices
      const [baseFee, suggestedTip] = await Promise.all([
        apiClient.getBaseFee(),
        apiClient.getSuggestedPriorityFee()
      ]);

      // Calculate maxFeePerGas (baseFee * 2 + tip for next block buffer)
      const baseFeeNumber = parseInt(baseFee, 16);
      const tipNumber = parseInt(suggestedTip, 16);
      const maxFeePerGas = (baseFeeNumber * 2 + tipNumber).toString(16);

      return {
        maxFeePerGas: `0x${maxFeePerGas}`,
        maxPriorityFeePerGas: suggestedTip,
        gasPrice: `0x${(baseFeeNumber + tipNumber).toString(16)}`,
      };
    } catch (error) {
      console.warn("Failed to get current gas info, using fallback values:", error);
      // Fallback values (adjust for your network)
      return {
        maxFeePerGas: "0x5D21DBA00", // 25 gwei
        maxPriorityFeePerGas: "0x3B9ACA00", // 1 gwei
        gasPrice: "0x5D21DBA00", // 25 gwei
      };
    }
  }
}