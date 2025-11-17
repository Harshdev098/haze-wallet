import { configureStore } from '@reduxjs/toolkit';
import ActiveWalletSlice from './slices/ActiveWallet';
import BalanceSlice from './slices/Balance';
import FederationDetailsSlice from './slices/FederationDetails';
import MintSlice from './slices/Mint';
import LightningSlice from './slices/LightningPayment';
import WalletSlice from './slices/WalletSlice';
import NotificationSlice from './slices/NotificationSlice';
import Mode from './slices/Mode';
import AlertSlice from './slices/Alerts';
import TransactionsSlice from './slices/TransactionSlice';

export const store = configureStore({
    reducer: {
        activeFederation: ActiveWalletSlice,
        balance: BalanceSlice,
        federationdetails: FederationDetailsSlice,
        mint: MintSlice,
        Lightning: LightningSlice,
        wallet: WalletSlice,
        notifications: NotificationSlice,
        Mode: Mode,
        Alert: AlertSlice,
        transaction: TransactionsSlice,
        activeWallet: ActiveWalletSlice,
    },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
