import React from 'react'
import ReactDOM from 'react-dom/client'
import './theme.css'
import App from './App'

const stored = typeof localStorage !== 'undefined' ? localStorage.getItem('rzz-theme') : null
const prefersDark = typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
document.documentElement.setAttribute('data-theme', stored || (prefersDark ? 'dark' : 'light'))

ReactDOM.createRoot(document.getElementById('root')).render(<App />)
