import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { configureStore } from '@reduxjs/toolkit';
import balanceReducer, { setCurrency, updateBalanceFromMsat } from '../redux/slices/Balance';
import * as BalanceService from '../services/BalanceService';
import { convertFromMsat, convertToMsats } from '../services/BalanceService';

const createTestStore = () => {
    return configureStore({
        reducer: {
            balance: balanceReducer,
        },
    });
};

describe('BalanceSlice', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        localStorage.clear();
    });

    it('should return the initial state', () => {
        const store = createTestStore();
        const state = store.getState().balance;

        expect(state.balance).toBe(0);
        expect(state.currency).toBe('sat');
    });

    it('should update currency', () => {
        const store = createTestStore();
        store.dispatch(setCurrency('usd'));

        const state = store.getState().balance;
        expect(state.currency).toBe('usd');
    });

    it('should update balance when async thunk is fulfilled', async () => {
        jest.spyOn(BalanceService, 'convertFromMsat').mockResolvedValue(42);

        const store = createTestStore();
        const result = await store.dispatch(updateBalanceFromMsat(42000));
        expect(updateBalanceFromMsat.fulfilled.match(result)).toBe(true);
        expect(result.payload).toBe(42);
        const state = store.getState().balance;
        expect(state.balance).toBe(42);
    });

    it('should call convertFromMsat with correct currency', async () => {
        jest.spyOn(BalanceService, 'convertFromMsat').mockResolvedValue(50);

        const store = createTestStore();
        store.dispatch(setCurrency('usd'));
        await store.dispatch(updateBalanceFromMsat(50000));
        expect(BalanceService.convertFromMsat).toHaveBeenCalledWith(50000, 'usd');

        const state = store.getState().balance;
        expect(state.balance).toBe(50);
        expect(state.currency).toBe('usd');
    });

    it('should use currency from localStorage on initialization', async () => {
        localStorage.setItem('walletCurrency', 'btc');
        jest.resetModules();
        const { default: freshReducer } = await import('../redux/slices/Balance');
        const store = configureStore({
            reducer: {
                balance: freshReducer,
            },
        });

        const state = store.getState().balance as any;
        expect(state.currency).toBe('btc');
    });

    it('should handle multiple balance updates', async () => {
        jest.spyOn(BalanceService, 'convertFromMsat')
            .mockResolvedValueOnce(10)
            .mockResolvedValueOnce(20)
            .mockResolvedValueOnce(30);

        const store = createTestStore();

        await store.dispatch(updateBalanceFromMsat(10000));
        expect(store.getState().balance.balance).toBe(10);

        await store.dispatch(updateBalanceFromMsat(20000));
        expect(store.getState().balance.balance).toBe(20);

        await store.dispatch(updateBalanceFromMsat(30000));
        expect(store.getState().balance.balance).toBe(30);
    });

    it('should maintain currency when updating balance', async () => {
        jest.spyOn(BalanceService, 'convertFromMsat').mockResolvedValue(100);

        const store = createTestStore();
        store.dispatch(setCurrency('eur'));
        expect(store.getState().balance.currency).toBe('eur');
        await store.dispatch(updateBalanceFromMsat(100000));
        expect(store.getState().balance.currency).toBe('eur');
        expect(store.getState().balance.balance).toBe(100);
    });

    it('should use default currency when localStorage is empty', () => {
        localStorage.clear();

        const store = createTestStore();
        const state = store.getState().balance;

        expect(state.currency).toBe('sat');
    });
});

describe('BalanceService', () => {
    beforeEach(() => {
        jest.restoreAllMocks();
        localStorage.clear();
    });

    it('should convert from msat to sats', async () => {
        const result = await convertFromMsat(1000, 'sat');
        expect(result).toBe(1);
    });

    it('should convert to msats from sats', async () => {
        const result = await convertToMsats(1, 'sat');
        expect(result).toBe(1000);
    });

    it('should handle zero msat conversion', async () => {
        const result = await convertFromMsat(0, 'sat');
        expect(result).toBe(0);
    });

    it('should convert from msat to msat (no conversion)', async () => {
        const result = await convertFromMsat(5000, 'msat');
        expect(result).toBe(5000);
    });

    it('should convert to msats from msat (no conversion)', async () => {
        const result = await convertToMsats(5000, 'msat');
        expect(result).toBe(5000);
    });

    it('should handle large numbers correctly', async () => {
        const oneBitcoinInMsats = 100_000_000_000;
        const result = await convertFromMsat(oneBitcoinInMsats, 'sat');
        expect(result).toBe(100_000_000);
    });

    it('should convert to msats from USD (requires exchange rate)', async () => {
        localStorage.setItem('usdRate', '50000');

        const result = await convertToMsats(1, 'usd');
        expect(result).toBeGreaterThan(0);
        expect(typeof result).toBe('number');
    });
});
