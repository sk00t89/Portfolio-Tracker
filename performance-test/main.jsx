import React from 'react';
import {createRoot} from 'react-dom/client';
import App from '../src/App.jsx';
import {BrowserRouter} from 'react-router-dom';
import '../src/index.css';
import '../src/App.css';
createRoot(document.getElementById('root')).render(<React.StrictMode><BrowserRouter><App/></BrowserRouter></React.StrictMode>);
