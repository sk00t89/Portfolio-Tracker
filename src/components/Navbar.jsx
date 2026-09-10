import {NavLink} from "react-router-dom";

function Navbar() {
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
                Login
            </div>

        </nav>
    );
}

export default Navbar;