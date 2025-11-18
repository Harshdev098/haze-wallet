import type { BalanceResponse } from '../hooks/wallet.type';
import type { AppDispatch } from '../redux/store';
import { Wallet } from '@fedimint/core-web';
import { updateBalanceFromMsat } from '../redux/slices/Balance';
import logger from '../utils/Logger';
const SATS_PER_BTC = 100_000_000;
const MSATS_PER_BTC = 100_000_000_000;

export const fetchBalance = async (wallet: Wallet): Promise<BalanceResponse> => {
    try {
        const value = await wallet.balance.getBalance();
        logger.log('balance', value);
        return value;
    } catch (err) {
        logger.log('Failed to fetch balance', err);
        throw new Error(`An error occured ${err}`);
    }
};

export const subscribeBalance = async (wallet: Wallet, dispatch: AppDispatch) => {
    const unsubscribeBalance = wallet.balance.subscribeBalance((mSats) => {
        dispatch(updateBalanceFromMsat(mSats));
        setTimeout(() => {
            unsubscribeBalance?.();
        }, 15000);
    });
};

export const fetchExchangeRates = async () => {
    try {
        const res = await fetch(
            'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd,eur'
        );
        const data = await res.json();
        if (data) {
            localStorage.setItem('usdRate', data.bitcoin.usd);
            localStorage.setItem('eurRate', data.bitcoin.eur);
        }
        return {
            usd: data.bitcoin.usd ?? localStorage.getItem('usdRate'),
            eur: data.bitcoin.eur ?? localStorage.getItem('eurRate'),
        };
    } catch (err) {
        logger.log('an error occured while fetching exchange rates', err);
    }
};

export const convertToMsats = async (amount: number, currency: string): Promise<number> => {
    if (currency === 'msat') return Number(amount.toFixed(0));
    if (currency === 'sat') return Number((amount * 1000).toFixed(0));

    const rates = await fetchExchangeRates();

    switch (currency.toLowerCase()) {
        case 'usd':
            return Number(
                (
                    (amount / (rates?.usd || Number(localStorage.getItem('usdRate')))) *
                    MSATS_PER_BTC
                ).toFixed(0)
            );
        case 'euro':
            return Number(
                (
                    (amount / (rates?.eur || Number(localStorage.getItem('eurRate')))) *
                    MSATS_PER_BTC
                ).toFixed(0)
            );
        default:
            return Number(amount.toFixed(0));
    }
};

export const convertFromMsat = async (msat: number, currency: string): Promise<number> => {
    const sats = msat / 1000;
    const btcValue = sats / SATS_PER_BTC;

    if (currency === 'msat') return Number(msat.toFixed(2));
    if (currency === 'sat') return Number(sats.toFixed(2));

    const rates = await fetchExchangeRates();

    switch (currency.toLowerCase()) {
        case 'usd':
            return Number((btcValue * (rates?.usd || localStorage.getItem('usdRate'))).toFixed(6));
        case 'euro':
            return Number((btcValue * (rates?.eur || localStorage.getItem('eurRate'))).toFixed(6));
        default:
            return Number(msat.toFixed(2));
    }
};
