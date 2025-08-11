import { SimulationApiClient } from './simulationClient';
import { EventAnalyzer } from './simulationParser';
import {
    TransactionArgs,
    SimulateV1IPSPParams,
    BlockOverrides,
    StateOverride,
    BatchSimulationResult,
    ParsedSimulationResult,
    SimBlockResult
} from '../types/simulation_interfaces';

export class SimulationService {
    private apiClient: SimulationApiClient;
    private eventAnalyzer: EventAnalyzer;

    constructor(rpcUrl: string) {
        this.apiClient = new SimulationApiClient(rpcUrl);
        this.eventAnalyzer = new EventAnalyzer(rpcUrl); // ✅ pass rpc
    }

    async simulateTransaction(transaction: TransactionArgs): Promise<BatchSimulationResult> {
        const params: SimulateV1IPSPParams = this.apiClient.createSimulationParams([transaction]);

        console.log('Simulating params:', params);

        try {
            const response = await this.apiClient.simulateV1IPSP(params);
            console.log('SimulateV1IPSP response:', response);
            // Even if the simulation reports an error (e.g., invalid signature),
            // try to parse events if results are present so we can display them.
            if (!response.success || (response.error && response.error.trim().length > 0)) {
                console.warn('Simulation reported error, attempting to parse any returned results for events...');
                if (response.results && response.results.length > 0) {
                    const parsedResults = await this.eventAnalyzer.parseTransactionEvents(response.results);
                    const gasEstimate = this.calculateGasEstimate(parsedResults);
                    console.log('Parsed events despite simulation error:', parsedResults);
                    return {
                        success: false,
                        error: response.error || 'Unknown error',
                        results: parsedResults,
                        gasEstimate
                    };
                }
                return {
                    success: false,
                    error: response.error || 'Unknown error',
                    results: []
                };
            }

            if (response.results) {
                const parsedResults = await this.eventAnalyzer.parseTransactionEvents(response.results); // ✅ await
                const gasEstimate = this.calculateGasEstimate(parsedResults);

                return {
                    success: true,
                    results: parsedResults,
                    gasEstimate
                };
            }

            return {
                success: false,
                error: 'No results returned',
                results: []
            };
        } catch (error) {
            console.log('SimulateV1IPSP error:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown simulation error',
                results: []
            };
        }
    }

    async simulateMultipleTransactions(
        transactions: TransactionArgs[],
        blockOverrides?: BlockOverrides,
        stateOverrides?: StateOverride
    ): Promise<BatchSimulationResult> {
        const params: SimulateV1IPSPParams = this.apiClient.createSimulationParams(
            transactions,
            {
                blockOverrides,
                stateOverrides,
                traceTransfers: true,
                validation: true,
                returnFullTransactions: true
            }
        );

        try {
            const response = await this.apiClient.simulateV1IPSP(params);

            // Fix: Check if error exists and is not empty
            if (!response.success || (response.error && response.error.trim().length > 0)) {
                return {
                    success: false,
                    error: response.error || 'Unknown error',
                    results: []
                };
            }

            const parsedResults = await this.eventAnalyzer.parseTransactionEvents(response.results); // ✅ await
            const gasEstimate = this.calculateGasEstimate(parsedResults);

            return {
                success: true,
                results: parsedResults,
                gasEstimate
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown simulation error',
                results: []
            };
        }
    }

    /**
     * Simulate batch transactions using wallet_sendCalls format
     */
    async simulateBatchTransactionCalls(calls: any[]): Promise<BatchSimulationResult> {
        // Convert wallet_sendCalls format to TransactionArgs format
        const transactions: TransactionArgs[] = calls.map((call, index) => {
            const tx: TransactionArgs = {
                to: call.to,
                data: call.data,
                value: call.value,
                gasLimit: call.gas,
                gasPrice: call.gasPrice,
                maxFeePerGas: call.maxFeePerGas,
                maxPriorityFeePerGas: call.maxPriorityFeePerGas,
            };

            console.log(`Call #${index + 1}`, {
                originalCall: call,
                transformedTransaction: tx
            });

            return tx;
        });

        return this.simulateMultipleTransactions(transactions);
    }

    private calculateGasEstimate(results: ParsedSimulationResult[]): number {
        let totalGas = 0;

        for (const blockResult of results) {
            for (const transaction of blockResult.transactions) {
                totalGas += parseInt(transaction.gasUsed, 16);
            }
        }

        return totalGas;
    }
}
