import { useState, useContext, useEffect, useCallback } from 'react';
import QRCode from 'react-qr-code';
import { useDispatch, useSelector } from 'react-redux';
import type { AppDispatch, RootState } from '../redux/store';
import { useWallet } from '../context/WalletManager';
import { convertFromMsat } from '../services/BalanceService';
import LoadingContext from '../context/Loading';
import { startProgress, doneProgress } from '../utils/ProgressBar';
import Alerts from '../components/Alerts';
import { downloadQRCode } from '../services/DownloadQR';
import Faq from '../components/Faq';
import Footer from '../components/Footer';
import BasicSettings from '../components/BasicSettings';
import { setErrorWithTimeout } from '../redux/slices/Alerts';
import '../style/Settings.css';
import { getMnemonic, getWalletInfo } from '@fedimint/core-web';
import NostrSettings from '../components/NostrSettings';

export default function Settings() {
    const dispatch = useDispatch<AppDispatch>();
    const { setLoader } = useContext(LoadingContext);
    const { metaData } = useSelector((state: RootState) => state.federationdetails);
    const { currency } = useSelector((state: RootState) => state.balance);
    const { wallet } = useWallet();
    const [balance, setBalance] = useState(0);
    const [joinDate, setJoinDate] = useState<number | undefined>(undefined);
    const [mnemonics, setMnemonics] = useState<string[] | null>([]);
    const [lastAccess, setLastAccess] = useState<number | undefined>(undefined);
    const { walletId, recoveryState } = useSelector((state: RootState) => state.activeFederation);
    const { error } = useSelector((state: RootState) => state.Alert);
    const [showMnemonics, setShowMnemonics] = useState(false);

    const walletDetails = useCallback(async () => {
        const joinDate = getWalletInfo(walletId)?.createdAt;
        const lastAccess = getWalletInfo(walletId)?.lastAccessedAt;
        const walletMnemonics = await getMnemonic();
        setMnemonics(walletMnemonics);
        setJoinDate(joinDate);
        setLastAccess(lastAccess);
    }, [walletId]);

    useEffect(() => {
        if (!recoveryState.status) {
            walletDetails();
        }
        document.title = 'Haze Wallet | Settings';
    }, [walletDetails, recoveryState.status]);

    useEffect(() => {
        const fetchBalance = async () => {
            try {
                startProgress();
                setLoader(true);
                const result = await wallet.balance.getBalance();
                const convertedAmount = await convertFromMsat(result, currency);
                setBalance(convertedAmount);
            } catch (err) {
                dispatch(
                    setErrorWithTimeout({
                        type: 'Balance Error: ',
                        message: err instanceof Error ? err.message : String(err),
                    })
                );
            } finally {
                doneProgress();
                setLoader(false);
            }
        };
        if (!recoveryState.status) {
            fetchBalance();
        }
    }, [balance, currency, walletId, recoveryState.status]);

    return (
        <>
            {error && <Alerts Error={error} />}
            <main className="setting">
                <section className="wallet-container">
                    <section className="wallet-details">
                        <div className="wallet-item">
                            <span className="wallet-label">Wallet Name:</span>
                            <span className="wallet-value">
                                {localStorage.getItem('walletName') || 'N/A'}
                            </span>
                        </div>
                        <div className="wallet-item">
                            <span className="wallet-label">Balance:</span>
                            <span className="wallet-value">
                                {balance} {currency.toUpperCase()}
                            </span>
                        </div>
                        <div className="wallet-item">
                            <span className="wallet-label">Join Date:</span>
                            <span className="wallet-value">
                                {joinDate ? new Date(joinDate).toLocaleString() : 'N/A'}
                            </span>
                        </div>
                        <div className="wallet-item">
                            <span className="wallet-label">Last Accessed:</span>
                            <span className="wallet-value">
                                {lastAccess ? new Date(lastAccess).toLocaleString() : 'N/A'}
                            </span>
                        </div>
                        <div className="wallet-item mnemonic-item">
                            <span className="wallet-label">Wallet Mnemonics:</span>

                            <div className="simple-warning">
                                <p>
                                    <strong>⚠️ Never share your recovery phrase with anyone</strong>
                                </p>
                                <p>Store it safely</p>
                            </div>

                            <div className="mnemonic-header">
                                <button
                                    className="mnemonic-toggle"
                                    onClick={() => setShowMnemonics(!showMnemonics)}
                                >
                                    {showMnemonics ? (
                                        <>
                                            <i className="fa-solid fa-eye-slash"></i>
                                            <span>Hide Phrase</span>
                                        </>
                                    ) : (
                                        <>
                                            <i className="fa-solid fa-eye"></i>
                                            <span>Show Phrase</span>
                                        </>
                                    )}
                                </button>

                                {mnemonics && showMnemonics && (
                                    <button
                                        className="copy-all-btn"
                                        onClick={() =>
                                            navigator.clipboard.writeText(mnemonics.join(' '))
                                        }
                                    >
                                        <i className="fa-solid fa-copy"></i>
                                    </button>
                                )}
                            </div>

                            <div className="mnemonic-list">
                                {mnemonics?.map((word, index) => (
                                    <span key={index} className="mnemonic-word">
                                        {showMnemonics === true
                                            ? `${index + 1}. ${word}`
                                            : `••••••`}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </section>

                    {metaData?.invite_code && (
                        <section className="invite-code">
                            <div className="qr-code-wrapper">
                                <div className="qrCode">
                                    <QRCode
                                        value={`${metaData.invite_code}`}
                                        size={200}
                                        bgColor="white"
                                        fgColor="black"
                                    />
                                    <button
                                        onClick={() => {
                                            downloadQRCode('inviteCode');
                                        }}
                                    >
                                        Download QR
                                    </button>
                                </div>
                                <p className="invite-code-text">
                                    Share the code with your friends!
                                </p>
                                <p className="invite-code-value">{`${metaData?.invite_code?.slice(0, 18)}...`}</p>
                                <i
                                    className="fa-solid fa-copy"
                                    style={{
                                        cursor: 'pointer',
                                        padding: '0px 4px',
                                        color: 'rgb(28, 116, 230)',
                                    }}
                                    onClick={() =>
                                        navigator.clipboard.writeText(metaData?.invite_code || '')
                                    }
                                ></i>
                            </div>
                        </section>
                    )}
                </section>
                <section className="modern-settings">
                    <BasicSettings />

                    <NostrSettings />

                    <Faq />

                    <Footer />
                </section>
            </main>
        </>
    );
}
