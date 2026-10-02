import { useState } from "react";
import { signIn, signUp } from "../services/authService";

export default function Login() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");

    async function handleLogin() {
        const { data, error } = await signIn(email, password);

        if (error) {
            console.error("Login error:", error.message);
            return;
        }

        console.log("Logged in:", data.user);
    }

    async function handleSignUp() {
        const { data, error } = await signUp(email, password);

        if (error) {
            console.error("Sign up error:", error.message);
            return;
        }

        console.log("User created:", data.user);
    }

    return (
        <div>
            <h1>Login</h1>

            <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
            />

            <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
            />

            <button
                className="primary-button"
                onClick={handleLogin()}>
                Logga in
            </button>
            <button
                className="primary-button"
                onClick={handleSignUp}>
                Skapa konto
            </button>
        </div>
    );
}