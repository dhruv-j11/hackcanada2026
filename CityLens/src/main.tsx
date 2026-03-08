import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { Auth0Provider } from '@auth0/auth0-react'

const auth0Domain = import.meta.env.VITE_AUTH0_DOMAIN;
const auth0ClientId = import.meta.env.VITE_AUTH0_CLIENT_ID;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {auth0Domain && auth0ClientId ? (
      <Auth0Provider
        domain={auth0Domain}
        clientId={auth0ClientId}
        authorizationParams={{ redirect_uri: window.location.origin }}
      >
        <App />
      </Auth0Provider>
    ) : (
      <App />
    )}
  </StrictMode>,
)
