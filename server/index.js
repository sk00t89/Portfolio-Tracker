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

    const primary = data.find((item) => item.isPrimary) || data[0];

    const normalized = {
        ticker: primary?.Code ?? null,
        exchange: primary?.Exchange ?? null,
        name: primary?.Name ?? null,
        assetType: primary?.Type ?? null,
        currency: primary?.Currency ?? null,
        isin: primary?.ISIN ?? null,
        previousClose: primary?.previousClose ?? null
    };

    res.json(normalized);
});

app.get("/api/currency/:from/:to", (req, res) => {
    const { from, to } = req.params;

    res.json({
        from,
        to,
        rate: 10.5
    });
});

app.listen(PORT, () => {
    console.log(`Backend kör på http://localhost:${PORT}`);
});