import {NavLink} from "react-router-dom";
import { signOut } from "../services/authService.js";

function Navbar(session) {

    async function handleLogout() {
        const { error } = await signOut();

        if (error) {
            console.error("Logout error:", error.message);
        }
    }

    return (
        <nav className="nav-bar">

            <div className="nav-brand">
                Portfolio Tracker
            </div>

            <ul className="nav-links">
                <li>
                    <NavLink
                        to="/"
                        className={({isActive}) =>
                            isActive ? "nav-link active" : "nav-link"
                        }
                    >
                        Dashboard
                    </NavLink>
                </li>

                <li>
                    <NavLink
                        to="/holdings"
                        className={({isActive}) =>
                            isActive ? "nav-link active" : "nav-link"
                        }
                    >
                        Holdings
                    </NavLink>
                </li>

                <li>
                    <NavLink
                        to="/import"
                        className={({isActive}) =>
                            isActive ? "nav-link active" : "nav-link"
                        }
                    >
                        Import
                    </NavLink>
                </li>

                <li>
                    <NavLink
                        to="/settings"
                        className={({isActive}) =>
                            isActive ? "nav-link active" : "nav-link"
                        }
                    >
                        Settings
                    </NavLink>
                </li>
            </ul>

            <div className="nav-login">
                {!session ? (
                    <NavLink
                        to="/login"
                        className={({ isActive }) =>
                            isActive ? "nav-link active" : "nav-link"
                        }
                    >
                        Login
                    </NavLink>
                ) : (
                    <button
                        className="danger-button"
                        onClick={handleLogout}
                    >
                        Logout
                    </button>
                )}
            </div>

        </nav>
    );
}

export default Navbar;