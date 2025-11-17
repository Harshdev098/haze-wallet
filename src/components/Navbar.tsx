import logo from '../assets/logo.webp';

export default function Navbar() {
    return (
        <>
            <nav>
                <img src={logo} alt="Fedimint Wallet" width={'180vw'} />
            </nav>
        </>
    );
}
