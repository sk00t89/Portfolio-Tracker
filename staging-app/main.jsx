import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import '../src/index.css';
import '../src/App.css';
import StagingApp from '../src/staging/StagingApp.jsx';

createRoot(document.getElementById('root')).render(<StrictMode><BrowserRouter><StagingApp/></BrowserRouter></StrictMode>);
