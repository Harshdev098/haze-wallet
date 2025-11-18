import { useState, useRef } from 'react';
import { useNavigate } from 'react-router';
import { Link } from 'react-router';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState, AppDispatch } from '../redux/store';
import Alerts from '../components/Alerts';
import Navbar from '../components/Navbar';
import { setNewJoin, setWalletId } from '../redux/slices/ActiveWallet';
import { setFederationId } from '../redux/slices/FederationDetails';
import { setErrorWithTimeout } from '../redux/slices/Alerts';
import {
    JoinFederation as JoinFederationService,
    previewFedWithInviteCode,
} from '../services/FederationService';
import { startProgress, doneProgress } from '../utils/ProgressBar';
import type { PreviewFederationResponse } from '../hooks/Federation.type';
import logger from '../utils/Logger';
import DiscoverFederation from '../components/DiscoverFederation';
import { setWalletStatus } from '../redux/slices/WalletSlice';
import '../style/JoinFederation.css';
import QRScanner from '../components/QrScanner';
import { setRecoverySate } from '../redux/slices/ActiveWallet';

export default function JoinFederation() {
    const [inviteCode, setInviteCode] = useState<string>('');
    const walletName = useRef<HTMLInputElement | null>(null);
    const [openVideo, setOpenVideo] = useState<boolean>(false);
    const [openPreviewFederation, setOpenPreviewFederation] = useState<boolean>(false);
    const [showFederations, setShowFederation] = useState<boolean>(false);
    const [previewFederationData, setPreviewFederationData] =
        useState<PreviewFederationResponse | null>(null);
    const [recover, setRecover] = useState<boolean>(false);
    const navigate = useNavigate();
    const dispatch = useDispatch<AppDispatch>();
    const [joining, setJoining] = useState<boolean>(false);
    const { error } = useSelector((state: RootState) => state.Alert);
    const [recovering, setRecovering] = useState<boolean>(false);
    document.title = 'Haze Wallet | Create Wallet';

    const handleJoinFederation = async (code?: string, recover?: boolean): Promise<void> => {
        setJoining(true);
        if (recover) {
            setRecovering(true);
        }
        try {
            startProgress();
            const result = await JoinFederationService(
                code || inviteCode,
                walletName.current?.value || 'fm-default',
                recover
            );
            dispatch(setWalletStatus('open'));
            dispatch(setFederationId(result.federationId));
            dispatch(setWalletId(result.id));
            localStorage.setItem('lastUsedWallet', result.id);
            localStorage.setItem('activeWallet', result.id);
            dispatch(setNewJoin(true));
            navigate('/wallet', { replace: true });
        } catch (err) {
            dispatch(setErrorWithTimeout({ type: 'Join Error:', message: `${err}` }));
        } finally {
            setJoining(false);
            setRecovering(false);
            doneProgress();
        }
    };

    const handlepreviewFederation = async (e: React.FormEvent | null, code?: string) => {
        e?.preventDefault();
        try {
            const finalInviteCode = inviteCode || code;
            if (!finalInviteCode) {
                throw new Error('please enter inviteCode');
            }
            startProgress();
            setJoining(true);
            const result = await previewFedWithInviteCode(finalInviteCode);
            logger.log('result is ', result);
            setPreviewFederationData(result);
            setOpenPreviewFederation(true);
        } catch (err) {
            dispatch(setErrorWithTimeout({ type: 'Preview Error:', message: `${err}` }));
        } finally {
            doneProgress();
            setJoining(false);
        }
    };

    const handleJoinWithQR = async (data: string) => {
        if (data) {
            setInviteCode(data);
            console.log('handlejoinwith qr ', data);
            setOpenVideo(false);
            await handlepreviewFederation({ preventDefault: () => {} } as React.FormEvent, data);
        }
    };

    return (
        <>
            <main className="JoinFedContainer">
                <Navbar />
                {error && <Alerts Error={error} />}
                <QRScanner
                    open={openVideo}
                    onClose={() => setOpenVideo(false)}
                    onError={(err) =>
                        setErrorWithTimeout({
                            type: 'Scanning failed: ',
                            message: err instanceof Error ? err.message : String(err),
                        })
                    }
                    onResult={(data) => handleJoinWithQR(data)}
                />
                {showFederations && (
                    <DiscoverFederation
                        setShowFederation={setShowFederation}
                        setInviteCode={setInviteCode}
                        joinFederation={handleJoinFederation}
                        recover={recover}
                        showFederations={showFederations}
                        setRecover={setRecover}
                    />
                )}
                {openPreviewFederation && previewFederationData && (
                    <div className="modalOverlay">
                        <div className="previewCard">
                            <button
                                type="button"
                                className="closeBtn"
                                onClick={() => {
                                    setOpenPreviewFederation(false);
                                    setPreviewFederationData(null);
                                }}
                            >
                                <i className="fa-solid fa-xmark"></i>
                            </button>
                            <h3>Federation Preview</h3>
                            <div className="previewDetails">
                                <div className="fed-image">
                                    {previewFederationData.iconUrl ? (
                                        <img src={previewFederationData.iconUrl} alt="icon" />
                                    ) : (
                                        <i className="fa-solid fa-landmark"></i>
                                    )}
                                </div>
                                <div className="fed-details">
                                    <h4>{previewFederationData.fedName}</h4>
                                    <p>{previewFederationData.federationID}</p>
                                    <div>
                                        <span>
                                            <b>Guardians:</b> {previewFederationData.totalGuardians}
                                        </span>
                                        <span>
                                            <b>Max stable Balance:</b>{' '}
                                            {previewFederationData.maxBalance}
                                        </span>
                                        <span>
                                            <b>Message:</b> {previewFederationData.welcomeMessage}
                                        </span>
                                        <span>
                                            <b>Onchain deposit:</b>{' '}
                                            {previewFederationData.onChainDeposit === 'true'
                                                ? 'Disabled'
                                                : 'Enabled'}
                                        </span>
                                        <span>
                                            <b>Services(modules):</b>{' '}
                                            {previewFederationData.modules &&
                                            Object.values(previewFederationData.modules).length > 0
                                                ? Object.values(previewFederationData.modules)
                                                      .map((m) => m.kind)
                                                      .join(', ')
                                                : 'N/A'}
                                        </span>
                                    </div>
                                    <div className="preview-action-btn">
                                        <button
                                            onClick={() => {
                                                handleJoinFederation();
                                            }}
                                            disabled={joining}
                                        >
                                            <i className="fa-solid fa-arrow-right-to-bracket"></i>{' '}
                                            {joining ? 'Joining...' : 'Join'}
                                        </button>
                                        <button
                                            onClick={() => {
                                                setRecover(true);
                                                dispatch(setRecoverySate({ status: true }));
                                                handleJoinFederation(undefined, true);
                                            }}
                                            disabled={recovering}
                                        >
                                            <i className="fa-solid fa-rotate-right"></i>{' '}
                                            {recovering ? 'Recovering...' : 'Recover'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                <section className="JoinFedSection">
                    <div className="JoinFedDiv">
                        <div>
                            <h2>Join Federation</h2>
                            <p style={{ fontSize: '1.2rem' }}>
                                Create your first Fedimint based Wallet by joining a federation
                                today!
                            </p>
                        </div>
                        <div className="JoinFedBox">
                            <form onSubmit={handlepreviewFederation} className="JoinFedForm">
                                <label>Invite Code</label>
                                <div className="input-with-icon">
                                    <input
                                        type="text"
                                        placeholder="Federation Invite Code"
                                        onChange={(e) => setInviteCode(e.target.value)}
                                        required
                                    />
                                    <button
                                        type="button"
                                        className="camera-btn"
                                        onClick={() => setOpenVideo(true)}
                                    >
                                        <i className="fa-solid fa-camera"></i>
                                    </button>
                                </div>
                                <label>Wallet name (optional)</label>
                                <input type="text" placeholder="Wallet name" ref={walletName} />
                                <button type="submit" disabled={joining}>
                                    {joining ? 'Joining...' : 'Continue'}
                                </button>
                                <p className="form-para" onClick={() => setShowFederation(true)}>
                                    Want to explore Federation?
                                </p>
                            </form>
                        </div>
                        <div>
                            <p style={{ padding: '30px 10px' }}>
                                Custody Bitcoin with ease and privacy — you control your funds, your
                                community, your future.
                            </p>
                        </div>
                    </div>
                </section>

                <footer>
                    <div>
                        <Link to={'https://github.com/Harshdev098/fedimint-web-wallet'}>
                            <i className="fa-brands fa-github"></i>
                        </Link>
                        <i className="fa-solid fa-code-branch"></i>
                        <Link to={'https://discord.gg/vatv8m5h'}>
                            <i className="fa-brands fa-discord"></i>
                        </Link>
                    </div>
                </footer>
            </main>
        </>
    );
}
