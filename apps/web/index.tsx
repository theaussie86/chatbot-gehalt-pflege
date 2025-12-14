import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App config={{
        projectId: import.meta.env.VITE_PROJECT_ID || 'dev_mode_project', // Fallback for local dev
        apiEndpoint: import.meta.env.VITE_API_ENDPOINT
    }} />
  </React.StrictMode>
);