import { useEffect, useState } from "react";
import { getExchangeRate } from "../services/currencyData.js";
import { formatCurrency, formatSek } from "../utils/formatting.js";

export default function useDisplayCurrency() {
    const [currency, setCurrency] = useState(() => {
        const saved = localStorage.getItem("dashboardCurrency");
        return ["SEK", "USD", "EUR"].includes(saved) ? saved : "SEK";
    });
    const [exchange, setExchange] = useState({ currency: "SEK", rate: 1, error: false });
    useEffect(() => {
        localStorage.setItem("dashboardCurrency", currency);
        if (currency === "SEK") return;
        let cancelled = false;
        getExchangeRate("SEK", currency).then((rate) => {
            if (!cancelled) setExchange({ currency, rate, error: false });
        }).catch(() => {
            if (!cancelled) setExchange({ currency, rate: null, error: true });
        });
        return () => { cancelled = true; };
    }, [currency]);
    const rate = currency === "SEK" ? 1 : exchange.currency === currency ? exchange.rate : null;
    return { currency, setCurrency, rate,
        error: currency !== "SEK" && exchange.currency === currency && exchange.error,
        formatMoney: (sek) => rate == null ? "–" : currency === "SEK"
            ? formatSek(sek) : formatCurrency(sek * rate, currency),
    };
}
