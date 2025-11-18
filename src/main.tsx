import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { store } from './redux/store.ts';
import { Provider } from 'react-redux';
import './index.css';
import App from './App.tsx';

createRoot(document.getElementById('root')!).render(
    <>
        <Provider store={store}>
            <BrowserRouter basename="/haze-wallet">
                <App />
            </BrowserRouter>
        </Provider>
    </>
);
