import { useContext, useEffect, useState } from 'react';
import Sidebar from '../components/Sidebar';
import { Outlet } from 'react-router';
import { useDispatch, useSelector } from 'react-redux';
import type { RootState, AppDispatch } from '../redux/store';
import { setGuardianStatus } from '../redux/slices/FederationDetails';
import { setNewJoin } from '../redux/slices/ActiveWallet';
import Alerts from '../components/Alerts';
import Header from '../components/Header';
import type { FederationConfig } from '../hooks/Federation.type';
import LoadingContext from '../context/Loading';
import webloader from '../assets/loader.webp';
import SendReceiveFAB from '../components/SendReceiveFAB';

export default function Main() {
    const dispatch = useDispatch<AppDispatch>();
    const { Details, metaData } = useSelector((state: RootState) => state.federationdetails);
    const { newJoin } = useSelector((state: RootState) => state.activeFederation);
    const { mode } = useSelector((state: RootState) => state.Mode);
    const { error } = useSelector((state: RootState) => state.Alert);
    const { walletStatus } = useSelector((state: RootState) => state.wallet);
    const { walletId, recoveryState } = useSelector((state: RootState) => state.activeFederation);
    const { loader, loaderMessage } = useContext(LoadingContext);
    const [isRecoveryExpanded, setIsRecoveryExpanded] = useState(true);

    const checkGuardianStatus = async (Details: FederationConfig) => {
        const endpoints = Object.entries(Details.api_endpoints);

        const statusPromises = endpoints.map(async ([key, endpoint]) => {
            let ws: WebSocket | null = null;

            const wsPromise = new Promise<string>((resolve) => {
                ws = new WebSocket((endpoint as { url: string }).url);

                ws.onopen = () => {
                    resolve('online');
                    ws?.close();
                };
                ws.onerror = () => {
                    resolve('offline');
                    ws?.close();
                };
            });

            const timeoutPromise = new Promise<string>((resolve) =>
                setTimeout(() => {
                    if (ws && ws.readyState !== ws.CLOSED) {
                        ws.close();
                    }
                    resolve('offline');
                }, 4000)
            );

            const status = await Promise.race([wsPromise, timeoutPromise]);
            return { key, status };
        });

        const results = await Promise.all(statusPromises);
        const statusMap: Record<number, string> = {};
        results.forEach(({ key, status }) => {
            statusMap[Number(key)] = status;
        });

        dispatch(setGuardianStatus({ status: statusMap }));
    };

    useEffect(() => {
        let interval: ReturnType<typeof setInterval> | undefined;
        if (Details && walletStatus === 'open') {
            checkGuardianStatus(Details);
            interval = setInterval(() => {
                checkGuardianStatus(Details);
            }, 60000);
        }

        return () => clearInterval(interval);
    }, [Details, walletStatus, walletId]);

    const toggleRecoveryExpansion = () => {
        setIsRecoveryExpanded(!isRecoveryExpanded);
    };

    return (
        walletStatus === 'open' &&
        metaData &&
        Details && (
            <main className="MainWalletContainer">
                {error && <Alerts Error={error} />}
                {metaData?.welcome_message && newJoin === true && (
                    <Alerts
                        Result={metaData.welcome_message}
                        onDismiss={() => {
                            dispatch(setNewJoin(false));
                        }}
                    />
                )}
                {metaData?.federation_expiry_timestamp && (
                    <Alerts
                        Result={`${metaData.welcome_message} federation Expiry time: ${new Date(metaData.federation_expiry_timestamp * 1000).toLocaleString()}`}
                    />
                )}

                <section
                    className={`WalletContentSection ${mode === true ? 'DarkMode' : 'WhiteMode'}`}
                >
                    <Header />

                    {recoveryState.status && (
                        <div
                            className={`recovery-progress ${isRecoveryExpanded ? 'expanded' : 'collapsed'}`}
                        >
                            {isRecoveryExpanded && (
                                <div className="recovery-content">
                                    <h4>
                                        Recovery progress:{' '}
                                        {`${recoveryState.progress?.complete}/${recoveryState.progress?.total}`}
                                    </h4>
                                    <p>Module id: {recoveryState.moduleId}</p>
                                </div>
                            )}
                            <button
                                className="recovery-toggle-btn"
                                onClick={toggleRecoveryExpansion}
                                aria-label={
                                    isRecoveryExpanded
                                        ? 'Collapse recovery progress'
                                        : 'Expand recovery progress'
                                }
                            >
                                {isRecoveryExpanded ? (
                                    <i className="fa-solid fa-angle-right"></i>
                                ) : (
                                    <i className="fa-solid fa-angle-left"></i>
                                )}
                            </button>
                        </div>
                    )}

                    {<Outlet />}
                </section>

                <Sidebar />

                {loader && (
                    <div className="modalOverlay">
                        <div className="web-loader">
                            <img src={webloader} alt="loading" />
                            <p style={{ fontSize: '17px', color: 'white', padding: '8px' }}>
                                {loaderMessage}
                            </p>
                        </div>
                    </div>
                )}
                <SendReceiveFAB />
            </main>
        )
    );
}
