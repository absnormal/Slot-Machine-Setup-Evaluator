import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './index.css'

console.info(`%c📦 Current Git Commit: %c${__GIT_COMMIT_LOG__}`, 'color: #8b5cf6; font-weight: bold;', 'color: #10b981; font-weight: bold;');

const root = createRoot(document.getElementById('root'))
root.render(<App />)
