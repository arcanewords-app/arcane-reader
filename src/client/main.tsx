import './i18n';
import { applyAppTheme, readAppTheme } from './utils/appTheme';
import { render } from 'preact';

applyAppTheme(readAppTheme());
import { CookieConsentProvider } from './contexts/CookieConsentContext';
import { AppRouter } from './AppRouter';
import './styles/index.css';

render(
  <CookieConsentProvider>
    <AppRouter />
  </CookieConsentProvider>,
  document.getElementById('app')!
);
