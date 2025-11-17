import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import type { Transaction } from '../../hooks/wallet.type';
import type {
    Transactions,
    EcashTransaction,
    LightningTransaction,
    WalletTransaction,
    Wallet,
} from '@fedimint/core-web';
import { parseBolt11Invoice } from '@fedimint/core-web';
import logger from '../../utils/Logger';

interface TxState {
    transactions: Transaction[];
    lastSeen: any | null;
    isFetching: boolean;
    hasMore: boolean;
    isSearchMode: boolean;
}

const initialState: TxState = {
    transactions: [],
    lastSeen: null,
    isFetching: false,
    hasMore: false,
    isSearchMode: false,
};

export const fetchTransactions = createAsyncThunk<
    { formattedTransactions: Transaction[]; lastSeen: any; hasMore: boolean },
    { limit: number; wallet: Wallet; lastSeen?: any }
>('transactions/fetch', async ({ limit, lastSeen, wallet }) => {
    const rawTxs = await wallet.federation.listTransactions(limit, lastSeen);
    logger.log('transactions are ', rawTxs);

    const formattedTransactions: Transaction[] = await Promise.all(
        rawTxs.map(async (tx: Transactions) => {
            let invoice = null;
            let outcome: string | null = null;
            let amountMsats = 0;
            let gateway = null;
            let onchainAddress = null;
            let fee = null;
            const kind = tx.kind;
            const timestamp = new Date(tx.timestamp).toLocaleString();
            const operationId = tx.operationId;
            const type = tx.type;

            if (tx.kind === 'ln') {
                invoice = (tx as LightningTransaction).invoice;
                outcome = (tx as LightningTransaction).outcome.toLowerCase() ?? null;
                gateway = (tx as LightningTransaction).gateway || 'N/A';
                amountMsats = (await parseBolt11Invoice(invoice)).amount;
                fee = (tx as LightningTransaction).fee;
            } else if (tx.kind === 'mint') {
                amountMsats = (tx as EcashTransaction).amountMsats / 1000;
                outcome = (tx as EcashTransaction).outcome?.toLowerCase() ?? null;
            } else if (tx.kind === 'wallet') {
                amountMsats = (tx as WalletTransaction).amountSats;
                outcome = (tx as WalletTransaction).outcome?.toLowerCase() ?? null;
                onchainAddress = (tx as WalletTransaction).onchainAddress;
                fee = (tx as WalletTransaction).fee;
            }

            return {
                invoice,
                operationId,
                type,
                amountMsats,
                outcome,
                timestamp,
                fee: fee ?? null,
                kind,
                gateway,
                onchainAddress,
            };
        })
    );

    const newLastSeen =
        rawTxs.length > 0
            ? {
                  creation_time: {
                      secs_since_epoch: Math.floor(
                          new Date(rawTxs[rawTxs.length - 1].timestamp).getTime() / 1000
                      ),
                      nanos_since_epoch:
                          (new Date(rawTxs[rawTxs.length - 1].timestamp).getTime() % 1000) *
                          1_000_000,
                  },
                  operation_id: rawTxs[rawTxs.length - 1].operationId,
              }
            : null;

    return {
        formattedTransactions,
        lastSeen: newLastSeen,
        hasMore: rawTxs.length >= limit,
    };
});

// async thunk for search operation
export const searchTransaction = createAsyncThunk<
    Transaction | null,
    { query: string; wallet: Wallet }
>('transactions/search', async ({ query, wallet }) => {
    logger.log('calling getOperation method');
    const result = await wallet.federation.getOperation(query);
    logger.log('result is ', result);
    if (!result) {
        return null;
    }

    let paymentType: 'receive' | 'send' | 'spend_oob' | 'reissue' | 'withdraw' | 'deposit' =
        'receive';
    let amount = 0;
    let timestamp = '-';
    let invoice = 'N/A';
    let gateway = 'N/A';
    const onchainAddress = null;
    const fee = null;

    const time = 'N/A';
    if (
        typeof time === 'object' &&
        time &&
        'secs_since_epoch' in time &&
        'nanos_since_epoch' in time
    ) {
        const t = time as any;
        timestamp = new Date(
            t.secs_since_epoch * 1000 + t.nanos_since_epoch / 1_000_000
        ).toLocaleString();
    }

    const moduleKind: string = result.operation_module_kind ?? 'unknown';
    const meta = result.meta as any;

    if (meta && typeof meta === 'object' && 'variant' in meta) {
        const variant = meta.variant;

        if (moduleKind === 'ln') {
            invoice = variant?.pay?.invoice ?? variant?.receive?.invoice ?? 'N/A';
            paymentType = variant?.pay ? 'send' : 'receive';
            gateway = variant?.receive?.gateway_id ?? variant?.send?.gateway_id ?? 'N/A';
            amount = (await parseBolt11Invoice(invoice)).amount;
        } else if (moduleKind === 'mint') {
            if ('spend_o_o_b' in variant) {
                paymentType = 'spend_oob';
            } else if ('reissuance' in variant) {
                paymentType = 'reissue';
            }

            if (typeof meta.amount === 'number') {
                amount = meta.amount;
            }
        } else if (moduleKind === 'wallet') {
            if (variant.withdraw?.amount && typeof variant.withdraw.amount === 'number') {
                amount = variant.withdraw.amount;
            }
            paymentType = variant.deposit ? 'deposit' : 'withdraw';
        }
    }

    let outcome = null;
    if (
        result.outcome?.outcome &&
        typeof result.outcome.outcome === 'object' &&
        result.outcome.outcome !== null
    ) {
        outcome =
            'success' in result.outcome.outcome
                ? 'success'
                : JSON.stringify(result.outcome.outcome);
    }

    return {
        timestamp: new Date(timestamp).toLocaleString(),
        type: paymentType,
        kind: moduleKind,
        amountMsats: amount,
        operationId: query,
        outcome,
        invoice,
        fee,
        gateway,
        onchainAddress,
    };
});

const transactionsSlice = createSlice({
    name: 'transactions',
    initialState,
    reducers: {
        resetTransactions(state) {
            state.transactions = [];
            state.lastSeen = null;
            state.hasMore = true;
            state.isSearchMode = false;
        },
        exitSearchMode(state) {
            state.transactions = [];
            state.lastSeen = null;
            state.hasMore = true;
            state.isSearchMode = false;
        },
    },
    extraReducers: (builder) => {
        builder
            // Handle fetchTransactions
            .addCase(fetchTransactions.pending, (state) => {
                state.isFetching = true;
            })
            .addCase(fetchTransactions.fulfilled, (state, action) => {
                if (state.isSearchMode) {
                    state.transactions = action.payload.formattedTransactions;
                    state.isSearchMode = false;
                } else {
                    state.transactions = [
                        ...state.transactions,
                        ...action.payload.formattedTransactions,
                    ];
                }
                state.lastSeen = action.payload.lastSeen;
                state.hasMore = action.payload.hasMore;
                state.isFetching = false;
            })
            .addCase(fetchTransactions.rejected, (state) => {
                state.isFetching = false;
            })
            // Handle searchTransaction
            .addCase(searchTransaction.pending, (state) => {
                state.isFetching = true;
            })
            .addCase(searchTransaction.fulfilled, (state, action) => {
                state.isSearchMode = true;
                state.transactions = action.payload ? [action.payload] : [];
                state.hasMore = false;
                state.isFetching = false;
            })
            .addCase(searchTransaction.rejected, (state) => {
                state.isSearchMode = true;
                state.transactions = [];
                state.hasMore = false;
                state.isFetching = false;
            });
    },
});

export const { resetTransactions, exitSearchMode } = transactionsSlice.actions;
export default transactionsSlice.reducer;
