import {
    createContext,
    useState,
    useEffect,
    useRef,
    useMemo,
    useCallback,
    useContext,
} from 'react';
import WalletManagerContext from './WalletManager';
import {
    deriveNostrSecretKey,
    handleDiscoverFederation,
    handleNWCConnection,
    handleNostrPayment,
} from '../services/nostrPayment';
import NDK, { NDKEvent, NDKPrivateKeySigner, NDKRelay, NDKSubscription } from '@nostr-dev-kit/ndk';
import NDKCacheAdapterDexie from '@nostr-dev-kit/ndk-cache-dexie';
import logger from '../utils/Logger';
import type { DiscoveredFederation } from '../hooks/Federation.type';
import { useSelector } from 'react-redux';
import type { RootState } from '../redux/store';
import { getMnemonic } from '@fedimint/core-web';
import { getPublicKey } from 'nostr-tools';
import { hexToBytes } from '@noble/hashes/utils';

interface NostrContextType {
    nwcEnabled: boolean;
    nwcURL: Array<{ appName: string; nwcUri?: string; relay?: string }>;
    setNWCURL: React.Dispatch<
        React.SetStateAction<{ appName: string; nwcUri?: string; relay?: string }[]>
    >;
    setNostrAppName: React.Dispatch<React.SetStateAction<string>>;
    NostrAppName: string;
    setNostrRelay: React.Dispatch<React.SetStateAction<string>>;
    NostrRelay: string;
    generateNWCConnection: (
        appName: string,
        relay?: string
    ) => Promise<{
        nwcUrl: string;
        clientPubKey: string;
        walletNostrSecretKey: string;
        walletNostrPubKey: string;
    } | null>;
    updateRelay: (relay: string) => void;
    DiscoverFederation: () => Promise<void>;
    discoveredFederations: DiscoveredFederation[];
    isConnected: boolean;
    connectionStatus: { relay: string; status: string }[];
    isDiscovering: boolean;
    stopDiscovery: () => void;
}

const NostrContext = createContext<NostrContextType>({
    nwcEnabled: false,
    nwcURL: [],
    setNWCURL: () => {},
    setNostrAppName: () => {},
    NostrAppName: '',
    setNostrRelay: () => {},
    NostrRelay: 'wss://relay.getalby.com/v1',
    generateNWCConnection: async () => null,
    updateRelay: () => {},
    DiscoverFederation: async () => {},
    discoveredFederations: [],
    isConnected: false,
    connectionStatus: [],
    isDiscovering: false,
    stopDiscovery: () => {},
});

export const NostrProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const walletContext = useContext(WalletManagerContext);
    const wallet = walletContext?.wallet;
    const { walletStatus } = useSelector((state: RootState) => state.wallet);
    const { walletId } = useSelector((state: RootState) => state.activeFederation);
    const [nwcEnabled, setNWCEnabled] = useState<boolean>(
        localStorage.getItem('nwcEnabled') === 'true'
    );
    const [nwcURL, setNWCURL] = useState<NostrContextType['nwcURL']>([]);
    const [connectionStatus, setConnectionStatus] = useState<NostrContextType['connectionStatus']>(
        []
    );
    const [NostrAppName, setNostrAppName] = useState('');
    const [NostrRelay, setNostrRelay] = useState<string>('wss://relay.getalby.com/v1');
    const [discoveredFederations, setDiscoveredFederations] = useState<DiscoveredFederation[]>([]);
    const [isDiscovering, setIsDiscovering] = useState(false); // Add discovery state
    const ndkRef = useRef<NDK | null>(null);
    const [isNostrInitialized, setIsNostrInitialized] = useState(false);
    const isRelayConnected = useRef(false);
    const subscriptionRef = useRef<NDKSubscription | null>(null);
    const isSubscriptionActive = useRef(false);
    const discoverySubscriptionRef = useRef<NDKSubscription | null>(null);
    const discoveryTimeoutRef = useRef(null);

    const DEFAULT_RELAYS = [
        'wss://nostr.mutinywallet.com/',
        'wss://relay.damus.io/',
        'wss://relay.getalby.com/v1/',
        'wss://nos.lol/',
        'wss://relay.nostr.band/',
        'wss://relay.snort.social/',
        'wss://relay.primal.net/',
        'wss://bitcoiner.social/',
        'wss://nostr.bitcoiner.social/',
    ];

    const [nwcRelays, setNWCRelays] = useState<string[]>(
        JSON.parse(localStorage.getItem('nwcRelays') || JSON.stringify(DEFAULT_RELAYS))
    );

    // Initialize connection status with all configured relays
    const initializeConnectionStatus = useCallback(() => {
        const initialStatus = nwcRelays.map((relay) => ({
            relay,
            status: 'disconnected',
        }));
        setConnectionStatus(initialStatus);
    }, [nwcRelays]);

    useEffect(() => {
        initializeConnectionStatus();
    }, [initializeConnectionStatus, nwcRelays]);

    const handleRelayConnect = useCallback((relay: NDKRelay) => {
        logger.log('Relay connected:', relay.url);

        setConnectionStatus((prev) => {
            const updated = prev.map((r) => {
                if (r.relay === relay.url) {
                    logger.log(`Updating ${r.relay} from ${r.status} to connected`);
                    return { ...r, status: 'connected' };
                }
                return r;
            });
            return updated;
        });
        isRelayConnected.current = true;
    }, []);

    const handleRelayDisconnect = useCallback((relay: NDKRelay) => {
        logger.log('Relay disconnected:', relay.url);

        setConnectionStatus((prev) => {
            const updated = prev.map((r) => {
                if (r.relay === relay.url) {
                    logger.log(`Updating ${r.relay} from ${r.status} to disconnected`);
                    return { ...r, status: 'disconnected' };
                }
                return r;
            });
            return updated;
        });
    }, []);

    // Initializing NDK
    const initializeNDK = useCallback(async () => {
        if (isNostrInitialized || ndkRef.current) {
            logger.log('NDK already initialized');
            return ndkRef.current;
        }

        try {
            logger.log('Initializing NDK...');
            const cacheAdapter = new NDKCacheAdapterDexie({ dbName: 'nwc-wallet-events' });

            await new Promise<void>((resolve) => {
                cacheAdapter.onReady(() => {
                    logger.log('NDK cache ready');
                    resolve();
                });
            });

            const ndk = new NDK({
                autoConnectUserRelays: true,
                cacheAdapter,
                explicitRelayUrls: nwcRelays,
            });

            ndkRef.current = ndk;

            ndk.pool.on('relay:connect', handleRelayConnect);
            ndk.pool.on('relay:disconnect', handleRelayDisconnect);

            // Connecting to relays in background
            ndk.connect().catch((err) => {
                logger.error('NDK connection failed', err);
            });

            setIsNostrInitialized(true);
            logger.log('NDK initialized successfully');

            return ndk;
        } catch (err) {
            logger.error('NDK initialization failed', err);
            setIsNostrInitialized(false);
            ndkRef.current = null;
            return null;
        }
    }, [nwcRelays, handleRelayConnect, handleRelayDisconnect]);

    // Clean up function for discovery
    const stopDiscovery = useCallback(() => {
        logger.log('Stopping federation discovery...');

        if (discoverySubscriptionRef.current) {
            discoverySubscriptionRef.current.stop();
            discoverySubscriptionRef.current = null;
        }

        if (discoveryTimeoutRef.current) {
            clearTimeout(discoveryTimeoutRef.current);
            discoveryTimeoutRef.current = null;
        }

        setIsDiscovering(false);
    }, []);

    useEffect(() => {
        return () => {
            const ndk = ndkRef.current;
            if (ndk) {
                ndk.pool.off('relay:connect', handleRelayConnect);
                ndk.pool.off('relay:disconnect', handleRelayDisconnect);
            }
            // Clean up payment subscription
            if (subscriptionRef.current) {
                subscriptionRef.current.stop();
                subscriptionRef.current = null;
                isSubscriptionActive.current = false;
            }
            // Clean up discovery subscription
            stopDiscovery();
        };
    }, [handleRelayConnect, handleRelayDisconnect, stopDiscovery]);

    // Memoized connection status
    const isConnected = useMemo(
        () => connectionStatus.some((r) => r.status === 'connected'),
        [connectionStatus]
    );

    // Wait for relay connection with shorter timeout and better error handling
    const waitForConnection = useCallback((): Promise<void> => {
        return new Promise((resolve, reject) => {
            const ndk = ndkRef.current;
            if (!ndk) return reject(new Error('NDK not initialized'));

            if (isConnected) {
                return resolve();
            }

            const timeout = setTimeout(() => {
                logger.log('Connection timeout, but proceeding relays anyway...');
                resolve();
            }, 5000);

            const checkInterval = setInterval(() => {
                const connected = Array.from(ndk.pool.relays.values()).filter(
                    (r) => r.connectivity.status === 1
                );
                if (connected.length > 0) {
                    clearTimeout(timeout);
                    clearInterval(checkInterval);
                    resolve();
                }
            }, 500);
        });
    }, [isConnected]);

    // Setup Nostr payment subscription
    const setupNostrSubscription = useCallback(async () => {
        try {
            if (!wallet || walletStatus !== 'open' || !nwcEnabled || !isNostrInitialized) {
                logger.log('Conditions not met for Nostr:', {
                    wallet: !!wallet,
                    walletStatus,
                    nwcEnabled,
                    isNostrInitialized,
                });
                return;
            }

            if (isSubscriptionActive.current) {
                return;
            }

            const ndk = ndkRef.current;
            if (!ndk) {
                logger.error('NDK not available');
                return;
            }

            logger.log('Running nostr nwc...');

            const mnemonic = await getMnemonic();
            if (!mnemonic || mnemonic.length === 0) {
                throw new Error('Mnemonic is empty');
            }

            const mnemonicStr = mnemonic.join(' ');
            const walletNostrSecretKey = deriveNostrSecretKey(mnemonicStr);
            const walletNostrPubKey = getPublicKey(hexToBytes(walletNostrSecretKey));

            if (!ndk.signer) {
                ndk.signer = new NDKPrivateKeySigner(walletNostrSecretKey);
                logger.log('NDK signer configured');
            }
            try {
                await waitForConnection();
            } catch (err) {
                logger.log('Connection wait failed, proceeding anyway:', err);
            }

            // Publish info event
            const infoEvent = new NDKEvent(ndk);
            infoEvent.kind = 13194;
            infoEvent.content = JSON.stringify({
                methods: [
                    'get_info',
                    'pay_invoice',
                    'make_invoice',
                    'get_balance',
                    'list_transactions',
                    'lookup_invoice',
                    'notifications',
                    'payment_sent',
                    'payment_received',
                ],
            });
            infoEvent.tags = [['p', walletNostrPubKey]];

            try {
                await infoEvent.sign();
                await infoEvent.publish();
                logger.log('Info event published successfully');
            } catch (err) {
                logger.error('Info event publish failed', err);
            }

            logger.log('=== SETTING UP SUBSCRIPTION ===');

            // Clean up existing subscription
            if (subscriptionRef.current) {
                subscriptionRef.current.stop();
            }

            subscriptionRef.current = await handleNostrPayment(wallet, walletNostrPubKey, ndk);
            isSubscriptionActive.current = true;

            logger.log('Nostr subscription setup complete');
        } catch (error) {
            logger.error('Failed to setup Nostr subscription:', error);
            isSubscriptionActive.current = false;
        }
    }, [wallet, walletStatus, nwcEnabled, isNostrInitialized, waitForConnection]);

    // Updated Discover federations function
    const DiscoverFederation = useCallback(async () => {
        try {
            // Stop any existing discovery first
            stopDiscovery();

            logger.log('Discovering federation...');
            setIsDiscovering(true);

            let ndk = ndkRef.current;
            if (!ndk) {
                ndk = await initializeNDK();
            }

            if (!ndk) throw new Error('Failed to initialize NDK');

            await waitForConnection();

            discoverySubscriptionRef.current = await handleDiscoverFederation(
                ndk,
                setDiscoveredFederations,
                discoveredFederations
            );
        } catch (err) {
            logger.error('Federation discovery failed:', err);
            setIsDiscovering(false);
        }
    }, [stopDiscovery, initializeNDK, waitForConnection, discoveredFederations]);

    // Generate NWC connection
    const generateNWCConnection = async (appName: string, relay?: string) => {
        try {
            // Ensuring NDK is initialized
            let ndk = ndkRef.current;
            if (!ndk) {
                ndk = await initializeNDK();
            }

            if (!ndk || !appName) return null;

            const connection = await handleNWCConnection(ndk, relay || null, appName);
            if (connection) {
                setNWCURL((prev) => [...prev, { appName, nwcUri: connection.nwcUrl }]);
                setNWCEnabled(true);
                localStorage.setItem('nwcEnabled', 'true');
                localStorage.setItem('autoPayNostr', 'true');
            }
            return connection;
        } catch (err) {
            logger.error('Failed to generate NWC connection:', err);
            return null;
        }
    };

    // Update relay
    const updateRelay = useCallback((url: string) => {
        setNWCRelays((prev) => {
            const updated = [...prev, url];
            localStorage.setItem('nwcRelays', JSON.stringify(updated));
            return updated;
        });
        setConnectionStatus((prev) => {
            const exists = prev.some((r) => r.relay === url);
            if (exists) return prev;
            return [...prev, { relay: url, status: 'disconnected' }];
        });
    }, []);

    // Retry failed events
    const retryFailedEvents = useCallback(async () => {
        const ndk = ndkRef.current;
        if (!ndk) return;

        const failed = await ndk?.cacheAdapter?.getUnpublishedEvents?.();
        if (failed?.length) {
            for (const ev of failed) {
                try {
                    await ev.event.publish();
                } catch {
                    // Silent catch
                }
            }
        }
    }, []);

    // Set NWC URI from localStorage
    const setNwcURI = useCallback(() => {
        const clientRelayKeys = JSON.parse(localStorage.getItem('ClientRelayKeys') || '{}');
        logger.log('getting keys from storage for setting nwcuri', clientRelayKeys);
        if (clientRelayKeys) {
            const uris = Object.entries(clientRelayKeys).map(([appName, value]) => {
                const { relay } = value as { clientPubKey: string; relay?: string };
                const effectiveRelay = relay || '';
                return {
                    appName,
                    relay: effectiveRelay,
                };
            });
            setNWCURL(uris);
        }
    }, []);

    // Initialize NDK on mount
    useEffect(() => {
        initializeNDK();
    }, [initializeNDK]);

    useEffect(() => {
        setNwcURI();
    }, [setNwcURI]);

    useEffect(() => {
        setupNostrSubscription();
    }, [setupNostrSubscription]);

    useEffect(() => {
        if (nwcEnabled && isNostrInitialized) {
            retryFailedEvents();
        }
    }, [nwcEnabled, isNostrInitialized, retryFailedEvents]);

    // Re-setup subscription when wallet changes
    useEffect(() => {
        if (walletId && isSubscriptionActive.current) {
            logger.log('Wallet changed, re-setting up subscription');
            isSubscriptionActive.current = false;
            setupNostrSubscription();
        }
    }, [walletId, setupNostrSubscription]);

    return (
        <NostrContext.Provider
            value={{
                nwcEnabled,
                nwcURL,
                setNWCURL,
                setNostrAppName,
                NostrAppName,
                setNostrRelay,
                NostrRelay,
                generateNWCConnection,
                updateRelay,
                DiscoverFederation,
                discoveredFederations,
                isConnected,
                connectionStatus,
                isDiscovering,
                stopDiscovery,
            }}
        >
            {children}
        </NostrContext.Provider>
    );
};

export default NostrContext;
