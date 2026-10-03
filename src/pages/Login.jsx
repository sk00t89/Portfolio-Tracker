import { useState } from "react";
import {
    signIn,
    signUp,
    signInWithGoogle,
} from "../services/authService";

export default function Login() {
    const [mode, setMode] = useState("login");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [message, setMessage] = useState("");

    async function handleLogin() {
        setMessage("");

        const { error } = await signIn(email, password);

        if (error) {
            setMessage("Fel lösenord eller e-post. Försök igen.");
            return;
        }
    }

    async function handleSignUp() {
        setMessage("");

        const { error } = await signUp(email, password);

        if (error) {
            setMessage("Det gick inte att skapa kontot. Försök igen.");
            return;
        }

        setMessage(
            "Kontot är skapat. Kontrollera din e-post för att verifiera kontot."
        );
    }

    async function handleGoogleLogin() {
        const { error } = await signInWithGoogle();

        if (error) {
            setMessage("Google-inloggningen misslyckades.");
        }
    }


    return (
        <div className="login-page">
            <div className="login-card">
                <div className="login-brand">
                    <div className="login-brand-dot" />
                    <span>Portfolio Tracker</span>
                </div>

                <p className="login-subtitle">
                    Samla hela din portfölj på ett ställe.
                </p>

                <h1>
                    {mode === "login"
                        ? "Logga in"
                        : "Skapa konto"}
                </h1>


                <input
                    type="email"
                    placeholder="E-post"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                />

                <input
                    type="password"
                    placeholder="Lösenord"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                />

                {message && (
                    <p className="login-message">
                        {message}
                    </p>
                )}

                {mode === "login" ? (
                    <>
                        <button
                            className="primary-button"
                            onClick={handleLogin}
                        >
                            Logga in
                        </button>
                        <div className="login-divider">
                            <span>eller</span>
                        </div>
                        <button
                            className="google-button"
                            onClick={handleGoogleLogin}
                            >
                            Fortsätt med Google
                        </button>

                        <p className="login-switch">
                            Har du inget konto?{" "}
                            <button
                                className="link-button"
                                onClick={() => {
                                    setMode("signup");
                                    setMessage("");
                                }}
                            >
                                Skapa konto
                            </button>
                        </p>
                    </>
                ) : (
                    <>
                        <button
                            className="primary-button"
                            onClick={handleSignUp}
                        >
                            Skapa konto
                        </button>

                        <p className="login-switch">
                            Har du redan ett konto?{" "}
                            <button
                                className="link-button"
                                onClick={() => {
                                    setMode("login");
                                    setMessage("");
                                }}
                            >
                                Logga in
                            </button>
                        </p>
                    </>
                )}

            </div>
        </div>
    );
}