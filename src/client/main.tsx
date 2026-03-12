import './i18n';
import { render } from 'preact';
import { CookieConsentProvider } from './contexts/CookieConsentContext';
import { AppRouter } from './AppRouter';
import './styles/index.css';

render(
  <CookieConsentProvider>
    <AppRouter />
  </CookieConsentProvider>,
  document.getElementById('app')!
);
