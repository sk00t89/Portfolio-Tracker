import {NavLink} from "react-router-dom";
import NavigationLinks from "./NavigationLinks.jsx";
import { signOut } from "../services/authService.js";

function Navbar({
                    session,
                    holdingsAttentionCount = 0,
                    theme = "dark",
                    onToggleTheme,
                }) {

    async function handleLogout() {
        const { error } = await signOut();

        if (error) {
            console.error("Logout error:", error.message);
        }
    }

    return (
        <nav className="nav-bar" aria-label="Huvudnavigation">
            <div className="nav-brand">
                Portfolio Tracker
            </div>

            <NavigationLinks holdingsAttentionCount={holdingsAttentionCount} />

            <div className="nav-actions">
                <button
                    className="theme-toggle"
                    type="button"
                    onClick={onToggleTheme}
                    aria-label={
                        theme === "dark"
                            ? "Byt till ljust läge"
                            : "Byt till mörkt läge"
                    }
                    title={
                        theme === "dark"
                            ? "Ljust läge"
                            : "Mörkt läge"
                    }
                >
                    <span aria-hidden="true">
                        {theme === "dark" ? "☀" : "☾"}
                    </span>
                    <span className="theme-toggle-text">
                        {theme === "dark" ? "Light" : "Dark"}
                    </span>
                </button>

                <div className="nav-login">
                    {!session ? (
                        <NavLink
                            to="/login"
                            className={({ isActive }) =>
                                isActive
                                    ? "nav-link active"
                                    : "nav-link"
                            }
                        >
                            Login
                        </NavLink>
                    ) : (
                        <button
                            className="danger-button nav-logout-button"
                            type="button"
                            onClick={handleLogout}
                        >
                            Logout
                        </button>
                    )}
                </div>
            </div>
        </nav>
    );
}

export default Navbar;
