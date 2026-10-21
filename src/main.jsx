import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { initBrowserMockApi } from './mock/browserMockApi.js'

// Automatically polyfill window.api with rich dummy data when running on Vercel or any Web Browser
initBrowserMockApi()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
