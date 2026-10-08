import { createMarketQuoteMiddleware } from "./marketQuoteMiddleware.js";
import express from "express";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3001;

app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "http://localhost:5173");
    res.setHeader("Access-Control-Allow-Headers", "authorization, apikey, content-type");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    if (req.method === "OPTIONS") return res.status(204).end();
    next();
});

app.use(createMarketQuoteMiddleware());

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


app.get("/api/nordnet-instrument/:instrumentId", async (req, res) => {
    const {instrumentId} = req.params;

    try {
        const url =
            `https://www.nordnet.se/api/2/instrument_search/query/instrument` +
            `?apply_filters=instrument_id%3D${encodeURIComponent(instrumentId)}`;

        const response = await fetch(url, {
            headers: {
                Accept: "application/json",
                "Client-Id": "NEXT",
                Referer: "https://www.nordnet.se/",
                "X-Nn-Href": "https://www.nordnet.se/",
            },
        });

        if (!response.ok) {
            throw new Error("Kunde inte hämta Nordnet-instrument");
        }

        const data = await response.json();
        const instrument = data.results?.[0];

        if (!instrument) {
            throw new Error("Inget Nordnet-instrument hittades");
        }

        res.json({
            instrumentId:
                instrument.instrument_info?.instrument_id ??
                instrument.instrument_id ??
                null,
            name:
                instrument.instrument_info?.name ??
                instrument.name ??
                null,
            ticker:
                instrument.instrument_info?.symbol ??
                instrument.symbol ??
                null,
            isin:
                instrument.instrument_info?.isin ??
                instrument.isin ??
                null,
            currency:
                instrument.instrument_info?.currency ??
                instrument.currency ??
                null,
            market:
                instrument.instrument_info?.market ??
                instrument.market ??
                null,
            country:
                instrument.instrument_info?.country ??
                instrument.country ??
                null,
            assetType:
                instrument.instrument_info?.instrument_type ??
                instrument.instrument_class ??
                instrument.instrument_type ??
                null,
            price:
                instrument.price_info?.last?.price ??
                instrument.price_info?.last ??
                null,
            provider: "Nordnet",
        });
    } catch (error) {
        console.error("Nordnet instrument detail error:", error);

        res.status(500).json({
            error: "Kunde inte hämta Nordnet-instrument",
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


        const normalized = data
            .flatMap((group) => {
                return group.results ?? [];
            })
            .filter((instrument) => {
                return instrument.instrument_id != null;
            })
            .map((instrument) => ({
                instrumentId: instrument.instrument_id,
                name: instrument.display_name,
                ticker: instrument.display_symbol ?? null,

                isin:
                    instrument.isin ??
                    instrument.instrument_info?.isin ??
                    null,

                assetType:
                    instrument.instrument_class ??
                    instrument.instrument_type_display_name ??
                    null,

                currency:
                    instrument.currency ??
                    instrument.instrument_info?.currency ??
                    null,

                market:
                    instrument.market ??
                    instrument.exchange_code ??
                    instrument.exchange ??
                    instrument.display_slug
                        ?.split("-")
                        .at(-1)
                        ?.toUpperCase() ??
                    null,

                country:
                    instrument.exchange_country ??
                    instrument.country ??
                    null,

                price:
                    instrument.last_price?.price ??
                    null,

                previousClose:
                    instrument.close_price?.price ??
                    null,

                instrumentType:
                    instrument.instrument_type ??
                    null,

                instrumentTypeName:
                    instrument.instrument_type_display_name ??
                    null,

                provider: "Nordnet",

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



app.get("/api/avanza-search-query/:query", async (req, res) => {
    const {query} = req.params;

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
                    query,
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
            throw new Error(
                "Kunde inte söka instrument hos Avanza"
            );
        }

        const data = await response.json();




        const getTickerFromTitle = (title) => {
            const matches =
                [...title.matchAll(/\(([^()]*)\)/g)];

            if (matches.length === 0) {
                return null;
            }

            return matches[matches.length - 1][1].trim();
        };

        const isLeveragedProduct = (hit) => {
            const name = hit.title.toUpperCase();

            return (
                name.startsWith("BULL ") ||
                name.startsWith("BEAR ") ||
                name.startsWith("MINI ") ||
                name.startsWith("TURBO ")
            );
        };

        const normalized = (data.hits ?? [])
            .filter((hit) => {
                if (
                    hit.type === "CERTIFICATE" &&
                    isLeveragedProduct(hit)
                ) {
                    return false;
                }

                return true;
            })
            .map((hit) => {
                const price =
                    hit.price?.last
                        ? Number(
                            hit.price.last
                                .replace(/\s/g, "")
                                .replace(",", ".")
                        )
                        : null;

                return {
                    instrumentId: hit.orderBookId,
                    name: hit.title,
                    ticker: getTickerFromTitle(hit.title),
                    assetType: hit.type ?? null,
                    currency: hit.price?.currency ?? null,
                    price,
                    provider: "Avanza",

                    country:
                        hit.flagCode ?? null,

                    market:
                        hit.marketPlaceName ?? null,

                    isin:
                        hit.isin ?? null,
                };
            });

        res.json(normalized);

    } catch (error) {
        console.error(
            "Avanza text search error:",
            error
        );

        res.status(500).json({
            error: "Kunde inte söka instrument hos Avanza",
        });
    }
});

app.get("/api/crypto-search/:query", async (req, res) => {
    const {query} = req.params;

    try {
        const response = await fetch(
            `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(query)}`,
            {
                headers: {
                    Accept: "application/json",
                    "x-cg-demo-api-key": process.env.COINGECKO_API_KEY,
                },
            }
        );

        if (!response.ok) {
            throw new Error("Kunde inte söka krypto");
        }

        const data = await response.json();

        const normalized = (data.coins ?? [])
            .slice(0, 10)
            .map((coin) => ({
                id: coin.id,
                name: coin.name,
                symbol: coin.symbol?.toUpperCase() ?? null,
                marketCapRank: coin.market_cap_rank ?? null,
                image: coin.large ?? coin.thumb ?? null,
                provider: "CoinGecko",
            }));

        res.json(normalized);

    } catch (error) {
        console.error("Crypto search error:", error);

        res.status(500).json({
            error: "Kunde inte söka krypto",
        });
    }
});


app.get("/api/crypto-price/:coinId", async (req, res) => {
    const {coinId} = req.params;

    try {
        const response = await fetch(
            `https://api.coingecko.com/api/v3/simple/price` +
            `?ids=${encodeURIComponent(coinId)}` +
            `&vs_currencies=sek&include_last_updated_at=true`,
            {
                headers: {
                    Accept: "application/json",
                    "x-cg-demo-api-key": process.env.COINGECKO_API_KEY,
                },
            }
        );

        if (!response.ok) {
            throw new Error("Kunde inte hämta kryptopris");
        }

        const data = await response.json();

        const price = data[coinId]?.sek ?? null;

        if (price === null) {
            throw new Error("Ingen kryptokurs hittades");
        }

        res.json({
            coinId,
            timestamp: data[coinId]?.last_updated_at ?? null,
            price,
            currency: "SEK",
        });

    } catch (error) {
        console.error("Crypto price error:", error);

        res.status(500).json({
            error: "Kunde inte hämta kryptopris",
        });
    }
});

app.get("/api/crypto-prices", async (req, res) => {
    const ids = req.query.ids;

    if (!ids) {
        return res.status(400).json({
            error: "Ids saknas",
        });
    }

    try {
        const response = await fetch(
            `https://api.coingecko.com/api/v3/simple/price` +
            `?ids=${encodeURIComponent(ids)}` +
            `&vs_currencies=sek`,
            {
                headers: {
                    Accept: "application/json",
                    "x-cg-demo-api-key":
                    process.env.COINGECKO_API_KEY,
                },
            }
        );

        if (!response.ok) {
            throw new Error(
                "Kunde inte hämta kryptopriser"
            );
        }

        const data = await response.json();

        res.json(data);

    } catch (error) {
        console.error(
            "Crypto prices error:",
            error
        );

        res.status(500).json({
            error: "Kunde inte hämta kryptopriser",
        });
    }
});

// LYSA ...

app.get("/api/lysa-fund-prices", async (req, res) => {
    try {
        const response = await fetch(
            "https://api.lysa.se/funds",
            {
                headers: {
                    Accept: "application/json",
                },
            }
        );

        if (!response.ok) {
            throw new Error(
                "Kunde inte hämta Lysa-fondkurser"
            );
        }

        const data = await response.json();

        res.json(data);

    } catch (error) {
        console.error(
            "Lysa fund price error:",
            error
        );

        res.status(500).json({
            error: "Kunde inte hämta Lysa-fondkurser",
        });
    }
});




app.listen(PORT, () => {
    console.log(`Backend kör på http://localhost:${PORT}`);
});
