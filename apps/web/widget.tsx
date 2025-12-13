import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

const WIDGET_ID = 'tvoed-calculator-widget';

declare global {
  interface Window {
    chatbot: (command: string, params?: any) => void;
  }
}

window.chatbot = (command: string, params?: any) => {
    if (command === 'init') {
        mountWidget(params);
    }
};

function mountWidget(config: any) {
    // Prevent multiple mounts
    if (document.getElementById(WIDGET_ID)) return;

    // 1. Create or find container
    let container = document.getElementById(WIDGET_ID);
    
    if (!container) {
        container = document.createElement('div');
        container.id = WIDGET_ID;
        
        // If a target element is provided in config (e.g. { target: '#my-chat-container' }), mount there
        if (config && config.target) {
            const targetEl = document.querySelector(config.target);
            if (targetEl) {
                targetEl.appendChild(container);
                // Embedded mode styles: fill the parent
                container.style.width = '100%';
                container.style.height = '100%';
                container.style.minHeight = '300px'; // Prevent it from being invisible if parent has 0 height
            } else {
                 console.error(`Target element ${config.target} not found. Appending to body.`);
                 document.body.appendChild(container);
                 // Fallback to basic container if target missing
                 container.style.position = 'relative';
                 container.style.width = '100%';
                 container.style.height = '100%';
            }
        } else {
            // Default popup mode (legacy support or if no target)
             container.style.position = 'fixed';
             container.style.bottom = '20px';
             container.style.right = '20px';
             container.style.zIndex = '999999';
             container.style.width = '400px';
             container.style.height = '600px';
             container.style.maxHeight = '90vh';
             container.style.maxWidth = '90vw';
             container.style.borderRadius = '12px';
             container.style.boxShadow = '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)';
             document.body.appendChild(container);
        }
    }

    // 2. Shadow DOM
    const shadowRoot = container.attachShadow({ mode: 'open' });

    // 3. Inject Styles
    // A. Google Fonts
    const fontLink = document.createElement('link');
    fontLink.rel = 'stylesheet';
    fontLink.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap';
    shadowRoot.appendChild(fontLink);

    // B. Main Styles
    // Attempt to find the script tag that loaded this widget to get the base URL
    const scripts = document.getElementsByTagName('script');
    let cssUrl = 'style.css'; // Default fallback
    
    for (let i = 0; i < scripts.length; i++) {
        const src = scripts[i].src;
        if (src && src.includes('widget.js')) {
            cssUrl = src.replace('widget.js', 'style.css');
            break;
        }
    }

    const styleLink = document.createElement('link');
    styleLink.rel = 'stylesheet';
    styleLink.href = cssUrl;
    shadowRoot.appendChild(styleLink);

    const root = ReactDOM.createRoot(shadowRoot);
    root.render(
        <React.StrictMode>
            <App config={config} />
        </React.StrictMode>
    );
}
