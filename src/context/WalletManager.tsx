import { createContext, useCallback, useEffect, useState, useContext, useRef } from 'react';
import { Wallet, setLogLevel, openWallet, getWallet, listClients } from '@fedimint/core-web';
import { useNavigate } from 'react-router';
import webloader from '../assets/loader.webp';
import logger from '../utils/Logger';
import { dbCache } from '../utils/WalletCache';
import { setErrorWithTimeout } from '../redux/slices/Alerts';
import { setWalletStatus } from '../redux/slices/WalletSlice';
import type { AppDispatch, RootState } from '../redux/store';
import { useDispatch, useSelector } from 'react-redux';
import type { FederationConfig, FederationMetaData } from '../hooks/Federation.type';
import { fetchFederationDetails } from '../services/FederationService';
import { setWalletId } from '../redux/slices/ActiveWallet';
import { setFederationId } from '../redux/slices/ActiveWallet';
import { setFederationDetails, setFederationMetaData } from '../redux/slices/FederationDetails';
import { startProgress, doneProgress } from '../utils/ProgressBar';
import LoadingContext from './Loading';
import { updateBalanceFromMsat } from '../redux/slices/Balance';
import { fetchTransactions, resetTransactions } from '../redux/slices/TransactionSlice';

interface WalletCache {
    wallet: Wallet;
    federationDetails: FederationConfig;
    federationMeta: FederationMetaData;
}

interface WalletManagerContextType {
    wallet: Wallet;
    setWallet: (_wallet: Wallet) => void;
    availableWalletList: { name: string; fedId: string; walletId: string }[];
    isLoadingAvailableFederations: boolean;
    isDebug: boolean;
    switchWallet: (walletId: string) => Promise<WalletCache | undefined>;
    refreshActiveWallet: () => Promise<void>;
    toggleDebug: () => void;
    loadWalletData: (walletId: string, walletInstance?: Wallet) => Promise<WalletCache | undefined>;
    getAvailableFederations: () => void;
}

const WalletManagerContext = createContext<WalletManagerContextType | undefined>(undefined);

// Global state to track initialization
const globalWalletState: {
    isInitialized: boolean;
    wallet: Wallet | null;
    initializationPromise: Promise<void> | null;
} = {
    isInitialized: false,
    wallet: null,
    initializationPromise: null,
};

export const WalletManagerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const navigate = useNavigate();
    const dispatch = useDispatch<AppDispatch>();
    const { setLoaderMessage, loaderMessage } = useContext(LoadingContext);
    const [loader, setLoader] = useState(true);
    const [wallet, setWallet] = useState<Wallet | null>(globalWalletState.wallet);
    const [availableWalletList, setAvailableWalletList] = useState<
        { name: string; fedId: string; walletId: string }[]
    >([]);
    const [isLoadingAvailableFederations, setIsLoadingAvailableFederations] = useState(true);
    const [isDebug, setIsDebug] = useState(localStorage.getItem('appDebug') === 'true');
    const { walletStatus } = useSelector((state: RootState) => state.wallet);
    const { walletId } = useSelector((state: RootState) => state.activeFederation);
    const walletCache = useRef<Map<string, WalletCache>>(new Map());
    const hasInitialized = useRef(false);

    //toggling the log level
    const toggleDebug = useCallback(() => {
        setIsDebug((prev) => {
            const newDebugState = !prev;
            localStorage.setItem('appDebug', newDebugState.toString());
            setLogLevel(newDebugState ? 'debug' : 'none');
            return newDebugState;
        });
        window.location.reload();
    }, []);

    const loadWalletData = useCallback(
        async (id: string, walletInstance?: Wallet) => {
            try {
                const walletId = id || localStorage.getItem('activeWallet');
                // Use provided wallet instance or get from state
                let currentWallet: Wallet | undefined = walletInstance;

                if (!currentWallet && walletId) {
                    logger.log(`Getting wallet instance for ${id}`);
                    currentWallet = await getWallet(walletId);
                    if (!currentWallet) {
                        throw new Error(`Failed to get wallet instance for ${id}`);
                    }
                    setWallet(currentWallet);
                    globalWalletState.wallet = currentWallet;
                }

                if (currentWallet) {
                    logger.log(
                        'wallet instance in loadWalletData is',
                        currentWallet,
                        currentWallet.id
                    );

                    // Check cache first
                    const cached = walletCache.current.get(id);
                    if (cached && cached.wallet.id === currentWallet?.id) {
                        logger.log(`Using cached data for wallet ${id}`);
                        dispatch(setFederationId(currentWallet.federationId));
                        dispatch(setWalletId(currentWallet.id));
                        dispatch(setFederationDetails(cached.federationDetails));
                        dispatch(setFederationMetaData(cached.federationMeta));
                        return cached;
                    }

                    // Check IndexedDB persistent cache
                    const idbData = await dbCache.getCachedData(currentWallet.federationId);

                    if (idbData.configData && idbData.metaData) {
                        const walletData: WalletCache = {
                            wallet: currentWallet,
                            federationDetails: idbData.configData,
                            federationMeta: idbData.metaData,
                        };

                        walletCache.current.set(id, walletData);

                        dispatch(setFederationId(currentWallet.federationId));
                        dispatch(setWalletId(currentWallet.id));
                        dispatch(setFederationDetails(idbData.configData));
                        dispatch(setFederationMetaData(idbData.metaData));

                        logger.log(
                            `Loaded data for ${id} from IndexedDB`,
                            currentWallet.federationId,
                            idbData.configData
                        );
                        return walletData;
                    }

                    // Load federation details if not found in cache
                    const federationResult = await fetchFederationDetails(
                        currentWallet,
                        currentWallet.federationId
                    );
                    if (!federationResult.details) {
                        throw new Error('Federation details missing');
                    }

                    // Update Redux store
                    dispatch(setFederationId(currentWallet.federationId));
                    dispatch(setWalletId(currentWallet.id));
                    dispatch(setFederationDetails(federationResult.details));
                    dispatch(setFederationMetaData(federationResult.meta));

                    const walletData: WalletCache = {
                        wallet: currentWallet,
                        federationDetails: federationResult.details,
                        federationMeta: federationResult.meta,
                    };

                    // Cache the data
                    walletCache.current.set(id, walletData);
                    dbCache.setData(
                        currentWallet.federationId,
                        walletData.federationDetails,
                        walletData.federationMeta
                    );
                    return walletData;
                }
            } catch (error) {
                logger.error(`Error loading wallet data for ${id}:`, error);
                throw error;
            }
        },
        [dispatch]
    );

    // getting available joined federations excluding the active one
    const getAvailableFederations = useCallback(async () => {
        logger.log('getting available joined federations', walletStatus, wallet);
        if (walletStatus === 'open' && wallet) {
            setIsLoadingAvailableFederations(true);
            const walletList = await listClients().filter(
                (w) => w.federationId !== wallet.federationId
            );

            const activeFederationList = await Promise.all(
                walletList.map(async (w) => {
                    const walletInstance = await openWallet(w.id);
                    const result = await fetchFederationDetails(walletInstance, w.federationId);
                    return {
                        name: result.meta.federation_name,
                        fedId: w.federationId,
                        walletId: walletInstance.id,
                    };
                })
            );
            logger.log('available joined federations are: ', activeFederationList);
            setAvailableWalletList(activeFederationList);
            setIsLoadingAvailableFederations(false);
        }
    }, [walletStatus, walletId]);

    // load available federations when wallet changes
    useEffect(() => {
        void getAvailableFederations(); // running it in background, do not wait to complete
    }, [walletStatus, walletId]);

    const switchWallet = useCallback(
        async (walletId: string) => {
            try {
                startProgress();
                logger.log(`Switching to wallet ${walletId}`);
                setLoaderMessage(`Switching to wallet ${walletId}`);

                // get or open the wallet first
                setLoaderMessage('Opening your wallet...');
                const walletData = (await getWallet(walletId)) || (await openWallet(walletId));
                if (!walletData) {
                    throw new Error(`Failed to open wallet ${walletId}`);
                }

                const previousWallet = wallet;
                setWallet(walletData);
                globalWalletState.wallet = walletData;

                // Load wallet data with the opened wallet instance
                setLoaderMessage('Loading wallet Data...');
                const result = await loadWalletData(walletData.id, walletData);

                if (result) {
                    setAvailableWalletList((prev) => {
                        if (!prev) return [];

                        const filtered = prev.filter((w) => w.walletId !== walletData.id);

                        if (previousWallet) {
                            const prevCached = walletCache.current.get(previousWallet.id);
                            filtered.push({
                                name: prevCached?.federationMeta?.federation_name || 'Unknown',
                                fedId: previousWallet.federationId,
                                walletId: previousWallet.id,
                            });
                        }

                        return filtered;
                    });

                    localStorage.setItem('lastUsedWallet', walletData.id);
                    localStorage.setItem('activeWallet', walletData.id);

                    logger.log(`Successfully switched to wallet ${walletId}`);
                    logger.log('available federations in switch functions: ', availableWalletList);
                }

                return result;
            } catch (err) {
                logger.error(`Failed to switch wallet:`, err);
                throw err; // handle it in component side
            } finally {
                doneProgress();
            }
        },
        [loadWalletData, wallet, availableWalletList, walletId]
    );

    const refreshActiveWallet = useCallback(async () => {
        if (!wallet) return;

        try {
            logger.log('Refreshing active wallet');
            dispatch(resetTransactions());
            dispatch(fetchTransactions({ limit: 5, wallet }));
            const msat = await wallet.balance.getBalance();
            dispatch(updateBalanceFromMsat(msat));
        } catch (error) {
            logger.error('Failed to refresh wallet:', error);
            dispatch(
                setErrorWithTimeout({
                    type: 'Refresh Error',
                    message: error instanceof Error ? error.message : 'Failed to refresh wallet',
                })
            );
        }
    }, [wallet, dispatch]);

    const initializeWallet = useCallback(async () => {
        // If already initialized and we have a wallet, just set the state and return
        if (globalWalletState.isInitialized && globalWalletState.wallet) {
            setWallet(globalWalletState.wallet);
            dispatch(setWalletStatus('open'));
            setLoader(false);
            return;
        }

        // If initialization is in progress, wait for it
        if (globalWalletState.initializationPromise) {
            await globalWalletState.initializationPromise;
            setWallet(globalWalletState.wallet);
            setLoader(false);
            return;
        }

        // Start initialization
        globalWalletState.initializationPromise = (async () => {
            try {
                const targetWalletId =
                    localStorage.getItem('lastUsedWallet') || localStorage.getItem('activeWallet');

                if (targetWalletId) {
                    dispatch(setWalletStatus('opening'));
                    const result = await switchWallet(targetWalletId);

                    if (result) {
                        logger.log('wallet loaded successfully', result.wallet);
                        globalWalletState.wallet = result.wallet;
                        (window as any).wallet = result.wallet;
                        globalWalletState.isInitialized = true;
                        dispatch(setWalletStatus('open'));
                    } else {
                        throw new Error('Failed to load initial wallet');
                    }
                } else {
                    logger.log('No wallet found, redirecting to home');
                    globalWalletState.isInitialized = true;
                    dispatch(setWalletStatus('closed'));
                    navigate('/');
                }
            } catch (error) {
                logger.error('Failed to load initial wallet:', error);
                globalWalletState.isInitialized = true;
                dispatch(setWalletStatus('closed'));
                dispatch(
                    setErrorWithTimeout({
                        type: 'Opening Error',
                        message: error instanceof Error ? error.message : 'Failed to load wallet',
                    })
                );
                navigate('/');
            }
        })();

        await globalWalletState.initializationPromise;
        globalWalletState.initializationPromise = null;
    }, [switchWallet]);

    useEffect(() => {
        if (!hasInitialized.current) {
            hasInitialized.current = true;
            initializeWallet().finally(() => setLoader(false));
        }
    }, [initializeWallet]);

    useEffect(() => {
        if (walletStatus === 'open' && globalWalletState.wallet) {
            setWallet(globalWalletState.wallet);
        }
    }, [walletStatus]);

    if (loader) {
        return (
            <div className="web-loader" style={{ backgroundColor: '#e4eef3' }}>
                <img src={webloader} alt="loading" />
                <p style={{ fontSize: '17px', color: '#4B5563', padding: '8px' }}>
                    {loaderMessage}
                </p>
            </div>
        );
    }

    if (wallet && walletStatus === 'open') {
        return (
            <WalletManagerContext.Provider
                value={{
                    wallet,
                    setWallet: (newWallet) => {
                        setWallet(newWallet);
                        globalWalletState.wallet = newWallet;
                    },
                    availableWalletList,
                    isLoadingAvailableFederations,
                    isDebug,
                    switchWallet,
                    refreshActiveWallet,
                    toggleDebug,
                    loadWalletData,
                    getAvailableFederations,
                }}
            >
                {children}
            </WalletManagerContext.Provider>
        );
    }

    // If wallet is not open, don't render children
    return null;
};

export const useWallet = () => {
    const context = useContext(WalletManagerContext);
    if (!context) {
        throw new Error('useWallet must be used within WalletProvider');
    }
    return context;
};

export default WalletManagerContext;
