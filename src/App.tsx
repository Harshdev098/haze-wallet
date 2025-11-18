import { Routes, Route, useNavigate } from 'react-router';
import { useEffect, useState, useRef } from 'react';
import { isInitialized, initialize, hasWallet, listClients, setLogLevel } from '@fedimint/core-web';
import './style/App.css';
import JoinFederation from './pages/JoinFederation';
import Wallet from './Wallet';
import { LoadingProvider } from './context/Loading.tsx';
import 'nprogress/nprogress.css';
import { WalletManagerProvider } from './context/WalletManager.tsx';
import { NostrProvider } from './context/Nostr.tsx';
import webloader from './assets/loader.webp';
import logger from './utils/Logger.ts';
import 'tippy.js/dist/tippy.css';

// Global initialization state to prevent re-initialization
const globalAppState = {
    isInitialized: false,
    initPromise: null as Promise<void> | null,
};

function AppInitializer({ children }: { children: React.ReactNode }) {
    const navigate = useNavigate();
    const [isAppReady, setIsAppReady] = useState(globalAppState.isInitialized);
    const initRef = useRef(false);

    useEffect(() => {
        if (globalAppState.isInitialized) {
            setIsAppReady(true);
            return;
        }

        if (globalAppState.initPromise) {
            globalAppState.initPromise.then(() => {
                setIsAppReady(true);
            });
            return;
        }

        if (initRef.current) return;
        initRef.current = true;

        const initializeApp = async () => {
            try {
                // Initialize SDK if not already done
                if (!isInitialized()) {
                    await initialize();
                    logger.log('SDK initialized');
                }

                if (localStorage.getItem('appDebug') === 'true') {
                    setLogLevel('debug');
                }

                const walletList = await listClients();
                logger.log('walletlist is ', walletList);
                const targetWalletId =
                    localStorage.getItem('lastUsedWallet') || localStorage.getItem('activeWallet');

                // If we have a target wallet ID and it exists, navigate to wallet
                if (targetWalletId && hasWallet(targetWalletId)) {
                    logger.log('Found existing wallet');
                    if (!window.location.pathname.startsWith('/haze-wallet/wallet')) {
                        navigate('/wallet');
                    }
                } else if (walletList.length > 0) {
                    logger.log('logger', walletList[0].id);
                    // If we have wallets but no specific target, use the first one
                    localStorage.setItem('activeWallet', walletList[0].id);
                    localStorage.setItem('lastUsedWallet', walletList[0].id);
                    if (!window.location.pathname.startsWith('/haze-wallet/wallet')) {
                        navigate('/wallet');
                    }
                } else {
                    logger.log('No wallets found, staying on join page');
                    // Only navigate if we're not already on the home page
                    if (window.location.pathname !== '/') {
                        navigate('/');
                    }
                }

                globalAppState.isInitialized = true;
                setIsAppReady(true);
            } catch (error) {
                logger.error('Failed to initialize app:', error);
                globalAppState.isInitialized = true; // Mark as initialized even on error
                setIsAppReady(true);
                navigate('/');
            } finally {
                globalAppState.initPromise = null;
            }
        };

        globalAppState.initPromise = initializeApp();
    }, [navigate]);

    if (!isAppReady) {
        return (
            <div className="web-loader">
                <img src={webloader} alt="loading" />
            </div>
        );
    }

    return <>{children}</>;
}

function App() {
    const WalletRoutes = () => {
        return (
            <WalletManagerProvider>
                <NostrProvider>
                    <Routes>
                        <Route path="/*" element={<Wallet />} />
                    </Routes>
                </NostrProvider>
            </WalletManagerProvider>
        );
    };

    const JoinFederationWithNostr = () => {
        return (
            <NostrProvider>
                <JoinFederation />
            </NostrProvider>
        );
    };

    return (
        <LoadingProvider>
            <AppInitializer>
                <Routes>
                    <Route path="/" element={<JoinFederationWithNostr />} />
                    <Route path="/wallet/*" element={<WalletRoutes />} />
                </Routes>
            </AppInitializer>
        </LoadingProvider>
    );
}

export default App;
