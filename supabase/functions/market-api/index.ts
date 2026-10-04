const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });

const nordnetHeaders = {
  Accept: "application/json",
  "Client-Id": "NEXT",
  Referer: "https://www.nordnet.se/",
  "X-Nn-Href": "https://www.nordnet.se/",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "GET") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const url = new URL(req.url);
    const marker = "/market-api";
    const markerIndex = url.pathname.indexOf(marker);
    const path =
      markerIndex >= 0
        ? url.pathname.slice(markerIndex + marker.length)
        : url.pathname;

    let match: RegExpMatchArray | null = null;

    match = path.match(/^\/api\/search\/([^/]+)$/);
    if (match) {
      const query = decodeURIComponent(match[1]);
      const apiKey = Deno.env.get("EODHD_API_KEY");

      const response = await fetch(
        `https://eodhd.com/api/search/${encodeURIComponent(query)}?api_token=${apiKey}&fmt=json&limit=5`
      );
      const data = await response.json();

      return json(
        (data ?? []).map((item: any) => ({
          ticker: item.Code ?? null,
          exchange: item.Exchange ?? null,
          name: item.Name ?? null,
          assetType: item.Type ?? null,
          currency: item.Currency ?? null,
          isin: item.ISIN ?? null,
          previousClose: item.previousClose ?? null,
        }))
      );
    }

    match = path.match(/^\/api\/price\/([^/]+)\/([^/]+)$/);
    if (match) {
      const ticker = decodeURIComponent(match[1]);
      const exchange = decodeURIComponent(match[2]);
      const apiKey = Deno.env.get("EODHD_API_KEY");
      const symbol = `${ticker}.${exchange}`;

      const response = await fetch(
        `https://eodhd.com/api/real-time/${encodeURIComponent(symbol)}?api_token=${apiKey}&fmt=json`
      );

      if (!response.ok) {
        return json({ error: "Kunde inte hämta aktuell kurs" }, 500);
      }

      const data = await response.json();

      return json({
        ticker,
        exchange,
        price: data.close ?? null,
        previousClose: data.previousClose ?? null,
        change: data.change ?? null,
        changePercent: data.change_p ?? null,
        timestamp: data.timestamp ?? null,
      });
    }

    match = path.match(/^\/api\/currency\/([^/]+)\/([^/]+)$/);
    if (match) {
      const from = decodeURIComponent(match[1]);
      const to = decodeURIComponent(match[2]);

      const response = await fetch(
        `https://api.frankfurter.dev/v2/rate/${from.toLowerCase()}/${to.toLowerCase()}`
      );

      if (!response.ok) {
        return json({ error: "Kunde inte hämta valutakurs" }, 500);
      }

      const data = await response.json();

      return json({
        from: data.base,
        to: data.quote,
        rate: data.rate,
        date: data.date,
      });
    }

    match = path.match(/^\/api\/yahoo-price\/([^/]+)$/);
    if (match) {
      const symbol = decodeURIComponent(match[1]);

      const response = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`
      );

      if (!response.ok) {
        return json({ error: "Kunde inte hämta Yahoo-kurs" }, 500);
      }

      const data = await response.json();
      const result = data.chart?.result?.[0];

      if (!result) {
        return json({ error: "Yahoo returnerade inget instrument" }, 404);
      }

      return json({
        symbol,
        price: result.meta?.regularMarketPrice ?? null,
        previousClose: result.meta?.chartPreviousClose ?? null,
        timestamp: result.meta?.regularMarketTime ?? null,
        currency: result.meta?.currency ?? null,
        exchangeName: result.meta?.exchangeName ?? null,
      });
    }

    match = path.match(/^\/api\/fund-price\/([^/]+)$/);
    if (match) {
      const instrumentId = decodeURIComponent(match[1]);
      const response = await fetch(
        `https://www.nordnet.se/api/2/instrument_search/query/fundlist?apply_filters=instrument_id%3D${encodeURIComponent(instrumentId)}`,
        { headers: nordnetHeaders }
      );

      if (!response.ok) {
        return json({ error: "Kunde inte hämta fonddata" }, 500);
      }

      const data = await response.json();
      const fund = data.results?.[0];

      if (!fund) {
        return json({ error: "Ingen fond hittades" }, 404);
      }

      return json({
        instrumentId: fund.instrument_info.instrument_id,
        isin: fund.instrument_info.isin,
        name: fund.instrument_info.name,
        price: fund.price_info?.last?.price ?? null,
        currency: fund.instrument_info.currency ?? null,
        timestamp: fund.price_info?.tick_timestamp ?? null,
      });
    }

    match = path.match(/^\/api\/nordnet-price\/([^/]+)$/);
    if (match) {
      const instrumentId = decodeURIComponent(match[1]);
      const response = await fetch(
        `https://www.nordnet.se/api/2/instruments/price/${encodeURIComponent(instrumentId)}?request_realtime=false`,
        { headers: nordnetHeaders }
      );

      if (!response.ok) {
        return json({ error: "Kunde inte hämta Nordnet-kurs" }, 500);
      }

      const data = await response.json();
      const priceData = data[0];

      if (!priceData) {
        return json({ error: "Ingen kursdata hittades" }, 404);
      }

      return json({
        instrumentId: priceData.instrument_id,
        price: priceData.last ?? null,
        bid: priceData.bid ?? null,
        ask: priceData.ask ?? null,
        previousClose: priceData.close ?? null,
        timestamp: priceData.tick_timestamp ?? null,
        delay: priceData.delay ?? null,
      });
    }

    match = path.match(/^\/api\/nordnet-instrument\/([^/]+)$/);
    if (match) {
      const instrumentId = decodeURIComponent(match[1]);
      const response = await fetch(
        `https://www.nordnet.se/api/2/instrument_search/query/instrument?apply_filters=instrument_id%3D${encodeURIComponent(instrumentId)}`,
        { headers: nordnetHeaders }
      );

      if (!response.ok) {
        return json({ error: "Kunde inte hämta Nordnet-instrument" }, 500);
      }

      const data = await response.json();
      const instrument = data.results?.[0];

      if (!instrument) {
        return json({ error: "Inget Nordnet-instrument hittades" }, 404);
      }

      return json({
        instrumentId:
          instrument.instrument_info?.instrument_id ??
          instrument.instrument_id ??
          instrumentId,
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
    }

    match = path.match(/^\/api\/nordnet-search\/([^/]+)$/);
    if (match) {
      const isin = decodeURIComponent(match[1]);
      const response = await fetch(
        `https://www.nordnet.se/api/2/instrument_search/query/instrument?apply_filters=isin%3D${encodeURIComponent(isin)}`,
        { headers: nordnetHeaders }
      );

      if (!response.ok) {
        return json({ error: "Kunde inte söka instrument hos Nordnet" }, 500);
      }

      const data = await response.json();
      const instrument = data.results?.[0];

      if (!instrument) {
        return json({ error: "Inget instrument hittades" }, 404);
      }

      return json({
        instrumentId: instrument.instrument_info.instrument_id,
        name: instrument.instrument_info.name,
        isin: instrument.instrument_info.isin,
        currency: instrument.instrument_info.currency,
        price: instrument.price_info?.last?.price ?? null,
        previousClose: instrument.price_info?.close?.price ?? null,
        timestamp: instrument.price_info?.tick_timestamp ?? null,
        realtime: instrument.price_info?.realtime ?? false,
      });
    }

    match = path.match(/^\/api\/nordnet-search-query\/([^/]+)$/);
    if (match) {
      const query = decodeURIComponent(match[1]);
      const response = await fetch(
        `https://www.nordnet.se/api/2/main_search?query=${encodeURIComponent(query)}&search_space=ALL&limit=10`,
        { headers: nordnetHeaders }
      );

      if (!response.ok) {
        return json({ error: "Kunde inte söka instrument hos Nordnet" }, 500);
      }

      const data = await response.json();

      return json(
        data
          .flatMap((group: any) => group.results ?? [])
          .filter((instrument: any) => instrument.instrument_id != null)
          .map((instrument: any) => ({
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
              instrument.display_slug?.split("-").at(-1)?.toUpperCase() ??
              null,
            country:
              instrument.exchange_country ??
              instrument.country ??
              null,
            price: instrument.last_price?.price ?? null,
            previousClose: instrument.close_price?.price ?? null,
            instrumentType: instrument.instrument_type ?? null,
            instrumentTypeName:
              instrument.instrument_type_display_name ?? null,
            provider: "Nordnet",
          }))
      );
    }

    match = path.match(/^\/api\/avanza-search\/([^/]+)$/);
    if (match) {
      const isin = decodeURIComponent(match[1]);
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
            searchFilter: { types: [] },
            screenSize: "DESKTOP",
            pagination: { from: 0, size: 30 },
            originPath: "/",
            originPlatform: "PWA",
            searchSessionId: crypto.randomUUID(),
          }),
        }
      );

      if (!response.ok) {
        return json({ error: "Kunde inte söka instrument hos Avanza" }, 500);
      }

      const data = await response.json();
      const hit = data.hits?.[0];

      if (!hit) {
        return json({ error: "Inget instrument hittades hos Avanza" }, 404);
      }

      const price = hit.price?.last
        ? Number(hit.price.last.replace(/\s/g, "").replace(",", "."))
        : null;

      return json({
        name: hit.title,
        type: hit.type,
        orderBookId: hit.orderBookId,
        price,
        currency: hit.price?.currency ?? null,
      });
    }

    match = path.match(/^\/api\/avanza-search-query\/([^/]+)$/);
    if (match) {
      const query = decodeURIComponent(match[1]);
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
            searchFilter: { types: [] },
            screenSize: "DESKTOP",
            pagination: { from: 0, size: 30 },
            originPath: "/",
            originPlatform: "PWA",
            searchSessionId: crypto.randomUUID(),
          }),
        }
      );

      if (!response.ok) {
        return json({ error: "Kunde inte söka instrument hos Avanza" }, 500);
      }

      const data = await response.json();

      const getTickerFromTitle = (title: string) => {
        const matches = [...title.matchAll(/\(([^()]*)\)/g)];
        return matches.length
          ? matches[matches.length - 1][1].trim()
          : null;
      };

      const isLeveragedProduct = (hit: any) => {
        const name = hit.title.toUpperCase();
        return (
          name.startsWith("BULL ") ||
          name.startsWith("BEAR ") ||
          name.startsWith("MINI ") ||
          name.startsWith("TURBO ")
        );
      };

      return json(
        (data.hits ?? [])
          .filter(
            (hit: any) =>
              !(
                hit.type === "CERTIFICATE" &&
                isLeveragedProduct(hit)
              )
          )
          .map((hit: any) => ({
            instrumentId: hit.orderBookId,
            name: hit.title,
            ticker: getTickerFromTitle(hit.title),
            assetType: hit.type ?? null,
            currency: hit.price?.currency ?? null,
            price: hit.price?.last
              ? Number(
                  hit.price.last
                    .replace(/\s/g, "")
                    .replace(",", ".")
                )
              : null,
            provider: "Avanza",
            country: hit.flagCode ?? null,
            market: hit.marketPlaceName ?? null,
            isin: hit.isin ?? null,
          }))
      );
    }

    match = path.match(/^\/api\/avanza-price\/([^/]+)$/);
    if (match) {
      const instrumentId = decodeURIComponent(match[1]);
      const response = await fetch(
        `https://www.avanza.se/_api/market-guide/stock/${encodeURIComponent(instrumentId)}`,
        {
          headers: {
            Accept: "application/json",
            Referer: "https://www.avanza.se/",
          },
        }
      );

      if (!response.ok) {
        return json({ error: "Kunde inte hämta Avanza-kurs" }, 500);
      }

      const data = await response.json();

      return json({
        instrumentId,
        price: data.quote?.last ?? null,
        previousClose: data.quote?.previousClose ?? null,
        currency: data.quote?.currency ?? data.currency ?? null,
        // Do not substitute fetch time for a missing source quote timestamp.
        timestamp: data.quote?.timestamp ?? null,
      });
    }

    match = path.match(/^\/api\/crypto-search\/([^/]+)$/);
    if (match) {
      const query = decodeURIComponent(match[1]);
      const apiKey = Deno.env.get("COINGECKO_API_KEY");

      const response = await fetch(
        `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(query)}`,
        {
          headers: {
            Accept: "application/json",
            "x-cg-demo-api-key": apiKey ?? "",
          },
        }
      );

      if (!response.ok) {
        return json({ error: "Kunde inte söka krypto" }, 500);
      }

      const data = await response.json();

      return json(
        (data.coins ?? []).slice(0, 10).map((coin: any) => ({
          id: coin.id,
          name: coin.name,
          symbol: coin.symbol?.toUpperCase() ?? null,
          marketCapRank: coin.market_cap_rank ?? null,
          image: coin.large ?? coin.thumb ?? null,
          provider: "CoinGecko",
        }))
      );
    }

    match = path.match(/^\/api\/crypto-price\/([^/]+)$/);
    if (match) {
      const coinId = decodeURIComponent(match[1]);
      const apiKey = Deno.env.get("COINGECKO_API_KEY");

      const response = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(coinId)}&vs_currencies=sek`,
        {
          headers: {
            Accept: "application/json",
            "x-cg-demo-api-key": apiKey ?? "",
          },
        }
      );

      if (!response.ok) {
        return json({ error: "Kunde inte hämta kryptokurs" }, 500);
      }

      const data = await response.json();
      const price = data[coinId]?.sek ?? null;

      if (price === null) {
        return json({ error: "Ingen kryptokurs hittades" }, 404);
      }

      return json({
        coinId,
        price,
        currency: "SEK",
      });
    }

    if (path === "/api/crypto-prices") {
      const ids = url.searchParams.get("ids");
      const apiKey = Deno.env.get("COINGECKO_API_KEY");

      if (!ids) {
        return json({ error: "Ids saknas" }, 400);
      }

      const response = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ids)}&vs_currencies=sek`,
        {
          headers: {
            Accept: "application/json",
            "x-cg-demo-api-key": apiKey ?? "",
          },
        }
      );

      if (!response.ok) {
        return json({ error: "Kunde inte hämta kryptopriser" }, 500);
      }

      return json(await response.json());
    }

    if (path === "/api/lysa-fund-prices") {
      const response = await fetch("https://api.lysa.se/funds", {
        headers: { Accept: "application/json" },
      });

      if (!response.ok) {
        return json({ error: "Kunde inte hämta Lysa-fondkurser" }, 500);
      }

      return json(await response.json());
    }

    return json({ error: "Route not found", path }, 404);
  } catch (error) {
    console.error(error);

    return json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Okänt serverfel",
      },
      500
    );
  }
});
