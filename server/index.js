/* eslint-env node */
import express from "express";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3001;

app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "http://localhost:5173");
    next();
});


app.get("/api/search/:query", async (req, res) => {
    const query = req.params.query;

    const url =
        `https://eodhd.com/api/search/${encodeURIComponent(query)}` +
        `?api_token=${process.env.EODHD_API_KEY}&fmt=json&limit=5`;

    const response = await fetch(url);
    const data = await response.json();



    const normalized = data.map((item) => ({
        ticker: item.Code ?? null,
        exchange: item.Exchange ?? null,
        name: item.Name ?? null,
        assetType: item.Type ?? null,
        currency: item.Currency ?? null,
        isin: item.ISIN ?? null,
        previousClose: item.previousClose ?? null,
    }));

    res.json(normalized);


});

app.get("/api/price/:ticker/:exchange", async (req, res) => {
    const {ticker, exchange} = req.params;

    try {
        const symbol = `${ticker}.${exchange}`;

        const url =
            `https://eodhd.com/api/real-time/${encodeURIComponent(symbol)}` +
            `?api_token=${process.env.EODHD_API_KEY}&fmt=json`;

        const response = await fetch(url);

        if (!response.ok) {
            throw new Error("Kunde inte hämta aktuell kurs");
        }

        const data = await response.json();

        res.json({
            ticker,
            exchange,
            price: data.close ?? null,
            previousClose: data.previousClose ?? null,
            change: data.change ?? null,
            changePercent: data.change_p ?? null,
            timestamp: data.timestamp ?? null,
        });
    } catch (error) {
        console.error("Kursfel:", error);

        res.status(500).json({
            error: "Kunde inte hämta aktuell kurs",
        });
    }
});

app.get("/api/currency/:from/:to", async (req, res) => {
    const {from, to} = req.params;

    try {
        const response = await fetch(
            `https://api.frankfurter.dev/v2/rate/${from.toLowerCase()}/${to.toLowerCase()}`
        );

        if (!response.ok) {
            throw new Error("Kunde inte hämta valutakurs");
        }

        const data = await response.json();

        res.json({
            from: data.base,
            to: data.quote,
            rate: data.rate,
            date: data.date,
        });
    } catch (error) {
        console.error("Valutafel:", error);

        res.status(500).json({
            error: "Kunde inte hämta valutakurs",
        });
    }
});

app.listen(PORT, () => {
    console.log(`Backend kör på http://localhost:${PORT}`);
});