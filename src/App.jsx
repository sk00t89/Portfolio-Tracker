

import "./App.css";
import Navbar from "./components/Navbar.jsx";
import {Routes, Route} from "react-router-dom";
import Dashboard from "./pages/Dashboard.jsx";
import Holdings from "./pages/Holdings.jsx";
import ImportPage from "./pages/ImportPage.jsx";
import Settings from "./pages/Settings.jsx";

function App() {





    return (
        <div className="app-shell">
            <Navbar/>
            <Routes>
                <Route path="/" element={<Dashboard/>}/>
                <Route path="/holdings" element={<Holdings/>}/>
                <Route path="/import" element={<ImportPage/>}/>
                <Route path="/settings" element={<Settings/>}/>
            </Routes>




        </div>
    );
}

export default App;