import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router';
import Tippy from '@tippyjs/react';

export default function SendReceiveFAB() {
    const [open, setOpen] = useState(false);
    const location = useLocation();
    const [width, setWidth] = useState(window.innerWidth);
    const navigate = useNavigate();
    const fabRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const handleResize = () => setWidth(window.innerWidth);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (fabRef.current && !fabRef.current.contains(event.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    if (location.pathname === '/wallet' || width > 750) return null;

    return (
        <div className="fab-container" ref={fabRef}>
            <button className="fab-main" onClick={() => setOpen(!open)}>
                <i className="fa-solid fa-bolt"></i>
            </button>

            <button
                className={`fab-side fab-send ${open ? 'open' : ''}`}
                onClick={() => navigate('/send')}
            >
                <Tippy content="Send">
                    <i className="fa-solid fa-arrow-up"></i>
                </Tippy>
            </button>

            <button
                className={`fab-side fab-receive ${open ? 'open' : ''}`}
                onClick={() => navigate('/receive')}
            >
                <Tippy content="Receive">
                    <i className="fa-solid fa-arrow-down"></i>
                </Tippy>
            </button>
        </div>
    );
}
