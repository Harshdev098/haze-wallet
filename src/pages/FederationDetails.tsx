import { useSelector } from 'react-redux';
import type { RootState } from '../redux/store';
import Guardians from './Guardian';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useWallet } from '../context/WalletManager';
import type {
    FederationModule,
    LNModule,
    MintModule,
    WalletModule,
    MetaModule,
} from '../hooks/Federation.type';

export default function FederationDetails() {
    const { Details, metaData, GuardianStatus } = useSelector(
        (state: RootState) => state.federationdetails
    );
    const { wallet } = useWallet();
    const [showGuardians, setShowGuardians] = useState<boolean>(false);
    const [expandedModules, setExpandedModules] = useState<string | null>(null);
    const [healthStatus, setHealthStatus] = useState<
        'Healthy' | 'Reachable' | 'Degraded' | 'Unreachable'
    >('Healthy');
    const { mode } = useSelector((state: RootState) => state.Mode);
    const navigate = useNavigate();

    const toggleDetails = (id: string) => {
        setExpandedModules((prev) => (prev === id ? null : id));
    };
    // eslint-disable-next-line
    const guardians = Object.keys(Details?.api_endpoints ?? {}).map((key: any, _) => ({
        id: key,
        name: Details?.api_endpoints[key].name,
        url: Details?.api_endpoints[key].url,
        pubKey: Details?.broadcast_public_keys[key],
        status: GuardianStatus.status[Number(key)] || 'checking',
    }));
    document.title = 'Haze Wallet | Federation';

    const onlineGuardians = guardians.filter((g) => g.status === 'online').length;
    const totalGuardians = guardians.length;

    useEffect(() => {
        const onlinePercentage = (onlineGuardians / totalGuardians) * 100;

        if (onlinePercentage >= 66) {
            setHealthStatus('Healthy');
        } else if (onlinePercentage >= 33) {
            setHealthStatus('Reachable');
        } else if (onlinePercentage >= 20) {
            setHealthStatus('Degraded');
        } else {
            setHealthStatus('Unreachable');
        }
    }, [onlineGuardians]);

    const AdvancedDetail = (mod: FederationModule) => {
        switch (mod.kind) {
            case 'ln': {
                const ln = mod as LNModule;
                return (
                    <>
                        <p>Threshold PubKey: {ln.threshold_pub_key || 'N/A'}</p>
                        <p>Contract Input: {ln.fee_consensus?.contract_input ?? 'N/A'}</p>
                        <p>Contract Output: {ln.fee_consensus?.contract_output ?? 'N/A'}</p>
                    </>
                );
            }
            case 'mint': {
                const mint = mod as MintModule;
                return (
                    <>
                        <p>Base Fee: {mint.fee_consensus?.base ?? 'N/A'}</p>
                        <p>PPM: {mint.fee_consensus?.parts_per_million ?? 'N/A'}</p>
                        {mint.max_notes_per_denomination && (
                            <p>Max Notes: {mint.max_notes_per_denomination ?? 'N/A'}</p>
                        )}
                    </>
                );
            }
            case 'wallet': {
                const wallet = mod as WalletModule;
                return (
                    <>
                        <p>Peg-in Descriptor: {wallet.peg_in_descriptor || 'N/A'}</p>
                        <p>Peg-in Fee: {wallet.fee_consensus?.peg_in_abs ?? 'N/A'}</p>
                        <p>Peg-out Fee: {wallet.fee_consensus?.peg_out_abs ?? 'N/A'}</p>
                        {wallet.default_bitcoin_rpc && (
                            <p>Bitcoin RPC: {wallet.default_bitcoin_rpc.url || 'N/A'}</p>
                        )}
                    </>
                );
            }
            case 'meta': {
                const meta = mod as MetaModule;
                return <p>Raw: {meta.raw || 'N/A'}</p>;
            }
            default:
                return <p>No extra details available</p>;
        }
    };

    return (
        <section className="federation">
            <div className="federation-glass-card">
                <div className="Fedheader">
                    <img
                        src={metaData?.federation_icon_url}
                        alt="Fed Icon"
                        className="federation-icon"
                    />
                    <div>
                        <h2 className="federation-title">{metaData?.federation_name}</h2>
                        <p className="subtitle" style={{ color: '#4B5563' }}>
                            {metaData?.federation_name} works on the consensus version v
                            {Details?.consensus_version.major}.{Details?.consensus_version.minor}
                        </p>
                    </div>
                </div>

                <div className="federation-grid">
                    <div className="federation-field">
                        <h3>
                            <i className="fa-solid fa-heart-pulse"></i> Health
                        </h3>
                        {healthStatus === 'Healthy' && <span>Federation is Healthy</span>}
                        {healthStatus === 'Degraded' && (
                            <span>Many guardians are offline, transactions may be slower</span>
                        )}
                        {healthStatus === 'Reachable' && (
                            <span>
                                Some guardians are offline, but the federation is still functional.
                            </span>
                        )}
                        {healthStatus === 'Unreachable' && <span>Not found guardians online</span>}
                        <p>
                            <strong
                                style={{
                                    fontSize: '1.4rem',
                                    color:
                                        healthStatus === 'Healthy' || healthStatus === 'Reachable'
                                            ? 'green'
                                            : healthStatus === 'Degraded'
                                              ? '#909048'
                                              : 'red',
                                }}
                            >
                                {healthStatus}
                            </strong>
                        </p>
                    </div>
                    <div className="federation-field">
                        <h3>🆔 Federation ID</h3>
                        <span>The unique ID of {metaData?.federation_name}</span>
                        <p>{wallet.federationId || 'N/A'}</p>
                    </div>
                    <div className="federation-field">
                        <h3>💰 On-chain Deposit</h3>
                        <span>Deposit funds from external bitcoin wallets to federation</span>
                        <p>
                            {metaData?.onchain_deposits_disabled === 'false'
                                ? 'Enabled'
                                : metaData?.onchain_deposits_disabled === 'true'
                                  ? 'Disabled'
                                  : 'N/A'}
                        </p>
                    </div>
                    <div className="federation-field">
                        <h3>📨 Welcome Message</h3>
                        <span>Welcome message from {metaData?.federation_name}</span>
                        <p>{metaData?.welcome_message || 'N/A'}</p>
                    </div>
                    <div className="federation-field">
                        <h3>📌 Pinned Message</h3>
                        <span>Pinned message from {metaData?.federation_name}</span>
                        <p>{metaData?.pinned_message || 'N/A'}</p>
                    </div>
                    {metaData?.federation_expiry_timestamp && (
                        <div className="federation-field">
                            <h3>⏳ Shutdown Time</h3>
                            <p>{metaData?.federation_expiry_timestamp}</p>
                        </div>
                    )}
                    {metaData?.max_stable_balance_msats && (
                        <div className="federation-field">
                            <h3>💵 Max Stable Balance</h3>
                            <span>Max stable Balance a federation can hold</span>
                            <p>{metaData?.max_stable_balance_msats / 1000} sat</p>
                        </div>
                    )}
                </div>

                <div className="modules-section">
                    <h2 className="modules-title">
                        <i className="fa-solid fa-file-invoice-dollar"></i> Available Federation
                        Services
                    </h2>
                    <div className="modules-grid">
                        {Object.entries(Details?.modules ?? {}).map(([, mod]) => {
                            const module = mod as FederationModule;

                            return (
                                <div className="module-card" key={module.id}>
                                    <i
                                        className="fa-solid fa-box-open"
                                        style={{
                                            fontSize: '2rem',
                                            padding: '6px',
                                            color: '#2176FF',
                                        }}
                                    ></i>
                                    <h4>
                                        {module.kind === 'ln'
                                            ? 'Lightning'
                                            : module.kind === 'mint'
                                              ? 'Minting'
                                              : module.kind.charAt(0).toUpperCase() +
                                                module.kind.slice(1)}
                                    </h4>
                                    {module.version && (
                                        <p>
                                            Module v{module.version.major}.{module.version.minor}
                                        </p>
                                    )}

                                    <p
                                        onClick={() => toggleDetails(module.kind)}
                                        style={{
                                            cursor: 'pointer',
                                            color: mode ? 'white' : 'blue',
                                        }}
                                    >
                                        {expandedModules === module.kind ? 'Hide' : 'Show'} advanced
                                        details
                                        <i className="fa-solid fa-angle-down"></i>
                                    </p>

                                    {expandedModules === module.kind && (
                                        <div className="module-details">
                                            {module.network && <p>Network: {module.network}</p>}
                                            {module.finality_delay && (
                                                <p>Finality Delay: {module.finality_delay}</p>
                                            )}
                                            {AdvancedDetail(module)}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className="federation-footer">
                    {metaData?.invite_code && (
                        <button
                            onClick={() =>
                                navigator.clipboard.writeText(metaData?.invite_code || '')
                            }
                        >
                            🔗 Copy Invite Code
                        </button>
                    )}
                    <button
                        onClick={() => {
                            setShowGuardians(!showGuardians);
                            navigate('/wallet/federation#guardians');
                        }}
                    >
                        <i className="fa-solid fa-shield"></i> {showGuardians ? 'Hide' : 'View'}{' '}
                        Guardians
                    </button>
                </div>

                {showGuardians && <Guardians />}
            </div>
        </section>
    );
}
