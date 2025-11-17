import { useRef, useContext, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import Tippy from '@tippyjs/react';
import type { RootState, AppDispatch } from '../redux/store';
import { setWalletId } from '../redux/slices/ActiveWallet';
import LoadingContext from '../context/Loading';
import Alerts from './Alerts';
import { JoinFederation as JoinFederationService } from '../services/FederationService';
import { setErrorWithTimeout } from '../redux/slices/Alerts';
import { startProgress, doneProgress } from '../utils/ProgressBar';
import logger from '../utils/Logger';
import { useWallet } from '../context/WalletManager';
import QRScanner from './QrScanner';
import DiscoverFederation from './DiscoverFederation';

export default function AddFederation({
    setJoinForm,
}: {
    setJoinForm: React.Dispatch<React.SetStateAction<boolean>>;
}) {
    const [inviteCode, setInviteCode] = useState<string>('');
    const walletName = useRef<HTMLInputElement | null>(null);
    const [openVideo, setOpenVideo] = useState<boolean>(false);
    const [showFederations, setShowFederation] = useState<boolean>(false);
    const { setLoader, setLoaderMessage } = useContext(LoadingContext);
    const { setWallet, switchWallet } = useWallet();
    const [recover, setRecover] = useState<boolean>(false);
    const dispatch = useDispatch<AppDispatch>();
    const [joining, setJoining] = useState<boolean>(false);
    const { error } = useSelector((state: RootState) => state.Alert);

    const handleJoinFederation = async (e?: React.FormEvent, qrData?: string): Promise<void> => {
        e?.preventDefault();

        const code = inviteCode || qrData;
        if (!code) return; // invitecode should not be empty
        setJoining(true);

        try {
            startProgress();
            setLoader(true);
            setLoaderMessage('Joining the Federation...');
            const result = await JoinFederationService(
                code,
                walletName.current?.value || '',
                recover
            );
            if (result) {
                logger.log('setting new wallet ', result);
                setWallet(result);
                dispatch(setWalletId(result.id));
                localStorage.setItem('activeWallet', result.id);
                localStorage.setItem('lastUsedWallet', result.id);
                await switchWallet(result.id);
            }
        } catch (err) {
            dispatch(
                setErrorWithTimeout({
                    type: 'Join Federation: ',
                    message: err instanceof Error ? err.message : String(err),
                })
            );
        } finally {
            setJoining(false);
            doneProgress();
            setJoinForm(false);
            setLoader(false);
        }
    };

    const handleJoinWithQR = async (data: string) => {
        setOpenVideo(false);
        await handleJoinFederation({ preventDefault: () => {} } as React.FormEvent, data);
    };

    return (
        <>
            {error && <Alerts Error={error} />}
            {showFederations && (
                <DiscoverFederation
                    setShowFederation={setShowFederation}
                    showFederations={showFederations}
                    joinFederation={(code: string) => handleJoinFederation(undefined, code)}
                    recover={recover}
                    setRecover={setRecover}
                    setInviteCode={setInviteCode}
                />
            )}
            <QRScanner
                open={openVideo}
                onClose={() => setOpenVideo(false)}
                onError={(err) =>
                    dispatch(
                        setErrorWithTimeout({
                            type: 'Scanning failed: ',
                            message: err instanceof Error ? err.message : String(err),
                        })
                    )
                }
                onResult={(data) => handleJoinWithQR(data)}
            />
            {!showFederations && (
                <div className="modalOverlay">
                    <div className="createInvoice">
                        <button
                            type="button"
                            className="closeBtn"
                            onClick={() => setJoinForm(false)}
                        >
                            <i className="fa-solid fa-xmark"></i>
                        </button>
                        <h2 style={{ marginBottom: '4px' }}>Add Federation</h2>
                        <p className="title-span">
                            Create the multiple wallets while joining federations
                        </p>
                        <form onSubmit={handleJoinFederation}>
                            <label htmlFor="amountvalue">Enter the invite code:</label>
                            <div className="input-with-icon">
                                <input
                                    type="decimal"
                                    id="amountvalue"
                                    onChange={(e) => setInviteCode(e.target.value)}
                                    className="amount-input"
                                    placeholder="Enter the invite code"
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
                            <label htmlFor="description">Wallet Name (optional)</label>
                            <input
                                type="text"
                                id="description"
                                className="amount-input"
                                placeholder="Enter the wallet name"
                                ref={walletName}
                            />
                            <label>
                                <input
                                    type="checkbox"
                                    checked={recover}
                                    onChange={(e) => setRecover(e.target.checked)}
                                />
                                Recover Wallet{' '}
                                <Tippy content="It will recover your wallet instead creating new one">
                                    <i className="fa-solid fa-info-circle"></i>
                                </Tippy>
                            </label>
                            <button type="submit" disabled={joining}>
                                Add Federation
                            </button>
                        </form>
                        <p
                            onClick={() => setShowFederation(true)}
                            style={{
                                textAlign: 'center',
                                padding: '4px',
                                margin: '6px',
                                fontSize: '1rem',
                                cursor: 'pointer',
                            }}
                        >
                            Want to explore Federation?
                        </p>
                    </div>
                </div>
            )}
        </>
    );
}
