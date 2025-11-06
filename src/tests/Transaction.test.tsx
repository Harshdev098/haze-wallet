import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { configureStore } from '@reduxjs/toolkit';
import transactionsReducer, {
    fetchTransactions,
    resetTransactions,
} from '../redux/slices/TransactionSlice';
import { DownloadTransactionsCSV } from '../services/DownloadQR';

jest.mock('@fedimint/core-web', () => ({
    __esModule: true,
    parseBolt11Invoice: jest.fn(),
    Wallet: jest.fn(),
}));

const mockClick = jest.fn();
let lastCreatedBlob: Blob | null = null;

beforeEach(() => {
    mockClick.mockReset();
    lastCreatedBlob = null;

    (global.URL as any).createObjectURL = jest.fn((blob: Blob) => {
        lastCreatedBlob = blob;
        return 'blob:mock-url';
    });

    (global.URL as any).revokeObjectURL = jest.fn();

    global.Blob = jest.fn().mockImplementation((content: string[], options: any) => {
        const textContent = content.join('');
        return {
            size: textContent.length,
            type: options?.type || '',
            text: () => Promise.resolve(textContent),
            arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
            slice: () => ({}) as Blob,
            stream: () => new ReadableStream(),
        } as Blob;
    });

    document.createElement = jest.fn().mockImplementation((tagName: string) => {
        if (tagName === 'a') {
            return {
                href: '',
                download: '',
                click: mockClick,
                setAttribute: jest.fn(),
                style: {},
                parentNode: null,
                remove: jest.fn(),
            } as any;
        }
        return {} as any;
    });

    document.body.appendChild = jest.fn();
    document.body.removeChild = jest.fn();
});

// ===================================================================
// 3. Import mocks
// ===================================================================
import { parseBolt11Invoice, Wallet } from '@fedimint/core-web';
const mockParseBolt11Invoice = parseBolt11Invoice as jest.Mock;

let mockListTransactions: jest.Mock;
const createMockWallet = () => {
    mockListTransactions = jest.fn();
    const wallet = new Wallet();
    (wallet as any).federation = { listTransactions: mockListTransactions };
    return wallet;
};

const createTestStore = () =>
    configureStore({
        reducer: { transactions: transactionsReducer },
    });

describe('DownloadTransactionsCSV', () => {
    it('throws error when no transactions', () => {
        expect(() => DownloadTransactionsCSV([])).toThrow('0 Transactions found');
    });

    it('generates CSV with correct headers and data', async () => {
        mockParseBolt11Invoice.mockResolvedValue({ amount: 50000 });

        const transactions = [
            {
                timestamp: '2025-04-05T10:00:00Z',
                kind: 'ln',
                type: 'Send',
                amountMsats: 50000,
                operationId: 'op123',
                outcome: 'SUCCESS',
                gateway: 'strike',
                invoice: 'lnbc500n1...',
            },
        ];

        DownloadTransactionsCSV(transactions as any);

        expect(global.URL.createObjectURL).toHaveBeenCalled();
        expect(mockClick).toHaveBeenCalled();

        expect(lastCreatedBlob).not.toBeNull();
        const text = await (lastCreatedBlob as Blob).text();
        const lines = text.trim().split('\n');

        expect(lines[0]).toBe(
            'TimeStamp,PaymentType,Type,Amount,OperationId,Outcome,Gateway,Invoice'
        );
        expect(lines[1]).toContain('"2025-04-05T10:00:00Z"');
        expect(lines[1]).toContain('ln');
        expect(lines[1]).toContain('50000');
        expect(lines[1]).toContain('op123');
    });

    it('handles ecash transactions', async () => {
        const transactions = [
            {
                timestamp: '2025-04-06T12:00:00Z',
                kind: 'mint',
                type: 'Receive',
                amountMsats: 1000000,
                operationId: 'mint456',
                outcome: 'success',
            },
        ];

        DownloadTransactionsCSV(transactions as any);

        const text = await (lastCreatedBlob as Blob).text();
        const row = text.trim().split('\n')[1];

        expect(row).toContain('mint');
        expect(row).toContain('1000000');
        expect(row).toContain('mint456');
    });
});

describe('fetchTransactions thunk', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockParseBolt11Invoice.mockReset();
    });

    it('handles empty list', async () => {
        const wallet = createMockWallet();
        mockListTransactions.mockResolvedValue([] as never);

        const store = createTestStore();
        await store.dispatch(fetchTransactions({ limit: 10, wallet }));

        const state = store.getState().transactions;
        expect(state.transactions).toEqual([]);
        expect(state.hasMore).toBe(false);
        expect(state.lastSeen).toBeNull();
    });
});

describe('transactions slice', () => {
    it('resets correctly', () => {
        const store = createTestStore();
        store.dispatch(resetTransactions());
        expect(store.getState().transactions.transactions).toEqual([]);
    });
});
