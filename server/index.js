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

// EODHD ...
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

// YAHOO ...

app.get("/api/yahoo-price/:symbol", async (req, res) => {
    const symbol = req.params.symbol;

    try {
        const url =
            `https://query1.finance.yahoo.com/v8/finance/chart/` +
            `${encodeURIComponent(symbol)}?interval=1d&range=1d`;

        const response = await fetch(url);

        if (!response.ok) {
            throw new Error("Kunde inte hämta Yahoo-kurs");
        }

        const data = await response.json();

        const result = data.chart?.result?.[0];

        if (!result) {
            throw new Error("Yahoo returnerade inget instrument");
        }

        res.json({
            symbol,
            price: result.meta?.regularMarketPrice ?? null,
            previousClose: result.meta?.chartPreviousClose ?? null,
            currency: result.meta?.currency ?? null,
            exchangeName: result.meta?.exchangeName ?? null,
        });
    } catch (error) {
        console.error("Yahoo price error:", error);

        res.status(500).json({
            error: "Kunde inte hämta Yahoo-kurs",
        });
    }
});

// NORDNET ...

app.get("/api/fund-price/:instrumentId", async (req, res) => {
    const {instrumentId} = req.params;

    try {
        const url =
            `https://www.nordnet.se/api/2/instrument_search/query/fundlist` +
            `?apply_filters=instrument_id%3D${instrumentId}`;

        const response = await fetch(url, {
            headers: {
                Accept: "application/json",
                "Client-Id": "NEXT",
                "X-Nn-Href": "https://www.nordnet.se/",
                Referer: "https://www.nordnet.se/",
            },
        });

        if (!response.ok) {
            throw new Error("Kunde inte hämta fonddata");
        }

        const data = await response.json();
        const fund = data.results?.[0];

        if (!fund) {
            throw new Error("Ingen fond hittades");
        }

        res.json({
            instrumentId: fund.instrument_info.instrument_id,
            isin: fund.instrument_info.isin,
            name: fund.instrument_info.name,
            price: fund.price_info?.last?.price ?? null,
            currency: fund.instrument_info.currency ?? null,
            timestamp: fund.price_info?.tick_timestamp ?? null,
        });
    } catch (error) {
        console.error("Fund price error:", error);

        res.status(500).json({
            error: "Kunde inte hämta fondpris",
        });
    }
});


app.get("/api/nordnet-price/:instrumentId", async (req, res) => {
    const {instrumentId} = req.params;

    try {
        const url =
            `https://www.nordnet.se/api/2/instruments/price/${instrumentId}` +
            `?request_realtime=false`;

        const response = await fetch(url, {
            headers: {
                Accept: "application/json",
                "Client-Id": "NEXT",
                Referer: "https://www.nordnet.se/",
                "X-Nn-Href": "https://www.nordnet.se/",
            },
        });

        if (!response.ok) {
            throw new Error("Kunde inte hämta Nordnet-kurs");
        }

        const data = await response.json();

        const priceData = data[0];

        if (!priceData) {
            throw new Error("Ingen kursdata hittades");
        }

        res.json({
            instrumentId: priceData.instrument_id,
            price: priceData.last ?? null,
            bid: priceData.bid ?? null,
            ask: priceData.ask ?? null,
            previousClose: priceData.close ?? null,
            timestamp: priceData.tick_timestamp ?? null,
            delay: priceData.delay ?? null,
        });

    } catch (error) {
        console.error("Nordnet price error:", error);

        res.status(500).json({
            error: "Kunde inte hämta Nordnet-kurs",
        });
    }
});

app.get("/api/nordnet-search/:isin", async (req, res) => {
    const {isin} = req.params;

    try {
        const url =
            `https://www.nordnet.se/api/2/instrument_search/query/instrument` +
            `?apply_filters=isin%3D${encodeURIComponent(isin)}`;

        const response = await fetch(url, {
            headers: {
                Accept: "application/json",
                "Client-Id": "NEXT",
                Referer: "https://www.nordnet.se/",
                "X-Nn-Href": "https://www.nordnet.se/",
            },
        });

        if (!response.ok) {
            throw new Error("Kunde inte söka instrument hos Nordnet");
        }

        const data = await response.json();

        const instrument = data.results?.[0];

        if (!instrument) {
            throw new Error("Inget instrument hittades");
        }

        res.json({
            instrumentId: instrument.instrument_info.instrument_id,
            name: instrument.instrument_info.name,
            isin: instrument.instrument_info.isin,
            currency: instrument.instrument_info.currency,
            price: instrument.price_info?.last?.price ?? null,
            previousClose: instrument.price_info?.close?.price ?? null,
            timestamp: instrument.price_info?.tick_timestamp ?? null,
            realtime: instrument.price_info?.realtime ?? false,
        });

    } catch (error) {
        console.error("Nordnet search error:", error);

        res.status(500).json({
            error: "Kunde inte söka instrument hos Nordnet",
        });
    }
});

app.get("/api/nordnet-search-query/:query", async (req, res) => {
    const {query} = req.params;

    try {
        const url =
            `https://www.nordnet.se/api/2/main_search` +
            `?query=${encodeURIComponent(query)}` +
            `&search_space=ALL` +
            `&limit=10`;

        const response = await fetch(url, {
            headers: {
                Accept: "application/json",
                "Client-Id": "NEXT",
                Referer: "https://www.nordnet.se/",
                "X-Nn-Href": "https://www.nordnet.se/",
            },
        });

        if (!response.ok) {
            throw new Error(
                "Kunde inte söka instrument hos Nordnet"
            );
        }

        const data = await response.json();

        const allowedAssetTypes = [
            "STOCK",
            "MUTUAL_FUND",
            "EXCHANGE_TRADED_FUND",
            "TRACKER",
        ];

        const normalized = data
            .flatMap((group) => {
                return group.results ?? [];
            })
            .filter((instrument) => {
                return instrument.instrument_id != null;
            })
            .filter((instrument) => {
                return allowedAssetTypes.includes(
                    instrument.instrument_class
                );
            })
            .map((instrument) => ({
                instrumentId: instrument.instrument_id,
                name: instrument.display_name,
                ticker: instrument.display_symbol ?? null,
                assetType:
                    instrument.instrument_class ??
                    instrument.instrument_type_display_name ??
                    null,
                currency: instrument.currency ?? null,
                price: instrument.last_price?.price ?? null,
                previousClose:
                    instrument.close_price?.price ?? null,
                country:
                    instrument.exchange_country ?? null,
                instrumentType:
                    instrument.instrument_type ?? null,
                instrumentTypeName:
                    instrument.instrument_type_display_name ?? null,
                provider: "Nordnet",
                isin: null,
            }));

        res.json(normalized);

    } catch (error) {
        console.error(
            "Nordnet text search error:",
            error
        );

        res.status(500).json({
            error: "Kunde inte söka instrument hos Nordnet",
        });
    }
});


// AVANZA ...



app.get("/api/avanza-search/:isin", async (req, res) => {
    const {isin} = req.params;

    try {
        const response = await fetch(
            "https://www.avanza.se/_api/search/filtered-search",
            {
                method: "POST",
                headers: {
                    Accept: "application/json",
                    "Content-Type": "application/json",
                    Referer: "https://www.avanza.se/",
                },
                body: JSON.stringify({
                    query: isin,
                    searchFilter: {
                        types: [],
                    },
                    screenSize: "DESKTOP",
                    pagination: {
                        from: 0,
                        size: 30,
                    },
                    originPath: "/",
                    originPlatform: "PWA",
                    searchSessionId: crypto.randomUUID(),
                }),
            }
        );

        if (!response.ok) {
            throw new Error("Kunde inte söka instrument hos Avanza");
        }

        const data = await response.json();

        const hit = data.hits?.[0];

        if (!hit) {
            throw new Error("Inget instrument hittades hos Avanza");
        }

        const price =
            hit.price?.last
                ? Number(
                    hit.price.last
                        .replace(/\s/g, "")
                        .replace(",", ".")
                )
                : null;

        res.json({
            name: hit.title,
            type: hit.type,
            orderBookId: hit.orderBookId,
            price,
            currency: hit.price?.currency ?? null,
        });

    } catch (error) {
        console.error("Avanza search error:", error);

        res.status(500).json({
            error: "Kunde inte söka instrument hos Avanza",
        });
    }
});


app.listen(PORT, () => {
    console.log(`Backend kör på http://localhost:${PORT}`);
});