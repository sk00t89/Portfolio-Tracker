import test from "node:test";
import assert from "node:assert/strict";
import { createSnapshotProviders } from "../supabase/functions/_shared/snapshotProviders.js";
import { latestCompletedSession } from "../supabase/functions/_shared/marketCalendar.js";
import { runUserSnapshot } from "../supabase/functions/_shared/snapshotRunner.js";
const now = Date.parse("2026-10-05T21:30:00Z");
const session = latestCompletedSession("STOCKHOLM", now);
const holding = { id: "h", name: "Example crypto ETP", ticker: "CRYPTOETP", instrumentId: "A42", provider: "Avanza",
    assetType: "CERTIFICATE", market: "XSTO", exchange: "XSTO", country: "SE", isin: "SE000EXAMPLE1", quantity: 3 };
const detail = (overrides = {}) => ({ orderbookId: "A42", isin: holding.isin, tickerSymbol: holding.ticker,
    market: "XSTO", quote: { last: 100, currency: "SEK", timestamp: new Date(session.closesAt).toISOString() }, ...overrides });
const info = (overrides = {}) => ({ instrument_id: "N99", isin: holding.isin, symbol: holding.ticker, market: "XSTO", currency: "SEK", ...overrides });
const price = (overrides = {}) => ({ instrument_id: "N99", last: 100, close: 77, tick_timestamp: session.closesAt, ...overrides });
function setup(route) {
    const calls = [];
    return { calls, providers: createSnapshotProviders({ clock: () => now, fetcher: async (url, options) => {
        calls.push({ url, options });
        const result = await route(url, options);
        return result instanceof Response ? result : new Response(JSON.stringify(result));
    } }) };
}
const unavailable = () => new Response('{"chart":{"error":{"description":"No data found, symbol may be delisted"}}}', { status: 404 });

test("Avanza-origin XSTO crypto certificate uses verified broker close without requiring Yahoo .ST", async () => {
    const { providers, calls } = setup((url) => url.includes("avanza.se/_api/market-guide/stock/A42") ? detail() : unavailable());
    const quote = await providers.close(holding, session);
    assert.equal(quote.provider, "Avanza"); assert.equal(quote.price, 100);
    assert.equal(quote.timestamp, session.closesAt); assert.equal(quote.date, session.date);
    assert.equal(calls.length, 2); assert.ok(calls[0].url.includes("avanza"));
});
test("Nordnet-origin ETP uses its own verified ID and genuine timestamp, never previous close", async () => {
    const { providers, calls } = setup((url) => url.includes("instrument_search") ? { results: [{ instrument_info: info() }] }
        : url.includes("instruments/price/N99") ? [price()] : unavailable());
    const quote = await providers.close({ ...holding, provider: "Nordnet", instrumentId: "N99", assetType: "ETP" }, session);
    assert.equal(quote.provider, "Nordnet"); assert.equal(quote.price, 100);
    assert.deepEqual(quote.attemptedProviders, ["Nordnet", "Yahoo"]); assert.equal(calls.length, 3);
});
test("fallback resolves matching ISIN at Nordnet without reusing Avanza ID", async () => {
    const { providers, calls } = setup((url) => url.includes("avanza") ? unavailable()
        : url.includes("instrument_search") ? { results: [{ instrument_info: info() }] }
            : url.includes("instruments/price/N99") ? [price()] : unavailable());
    const quote = await providers.close(holding, session);
    assert.equal(quote.provider, "Nordnet"); assert.deepEqual(quote.attemptedProviders, ["Avanza", "Nordnet", "Yahoo"]);
    const brokerCalls = calls.filter((c) => c.url.includes("nordnet"));
    assert.ok(brokerCalls[0].url.includes(`isin%3D${holding.isin}`));
    assert.ok(brokerCalls.every((c) => !c.url.includes("A42")));
});
test("Nordnet fallback to Avanza resolves candidates by ISIN and verifies details", async () => {
    const { providers, calls } = setup((url, options) => url.includes("nordnet") ? unavailable()
        : url.includes("filtered-search") ? (assert.equal(JSON.parse(options.body).query, holding.isin), { hits: [{ orderBookId: "A42" }] })
            : url.includes("stock/A42") ? detail() : unavailable());
    const quote = await providers.close({ ...holding, provider: "Nordnet", instrumentId: "N99", assetType: "ETP" }, session);
    assert.equal(quote.provider, "Avanza");
    assert.ok(calls.filter((c) => c.url.includes("avanza")).every((c) => !c.url.includes("N99")));
});
test("invalid identity, listing, currency and timestamp cannot become a broker closing price", async () => {
    const cases = [detail({ isin: "OTHER" }), detail({ orderbookId: "OTHER" }), detail({ tickerSymbol: "OTHER" }),
        detail({ market: "UNKNOWN" }), detail({ quote: { last: 100, currency: "SEK" } }),
        detail({ quote: { last: 100, currency: "SEK", timestamp: session.closesAt - 5 * 60000 - 1 } }),
        detail({ quote: { last: 100, currency: "SEK", timestamp: session.closesAt - 86400000 } }),
        detail({ quote: { last: 100, currency: "SEK", timestamp: session.closesAt + 60 * 60000 + 1 } }),
        detail({ quote: { last: 100, currency: "SEK", timestamp: now + 1000 } }),
        detail({ quote: { last: 0, currency: "SEK", timestamp: session.closesAt } })];
    for (const data of cases) {
        const { providers } = setup((url) => url.includes("stock/A42") ? data : unavailable());
        await assert.rejects(providers.close(holding, session), (error) => error.diagnostics.code === "LISTED_PRODUCT_CLOSE_UNAVAILABLE");
    }
});
test("Yahoo fallback needs verified ISIN as well as symbol, venue and completed daily bar", async () => {
    function yahoo(isin) { return { chart: { result: [{ meta: { symbol: "CRYPTOETP.ST", isin, exchangeName: "STO",
        exchangeTimezoneName: session.zone, currency: "SEK" }, timestamp: [session.opensAt / 1000], indicators: { quote: [{ close: [101] }] } }] } }; }
    for (const isin of [undefined, "OTHER", holding.isin]) {
        const { providers } = setup((url) => url.includes("yahoo") ? yahoo(isin) : unavailable());
        if (isin === holding.isin) {
            const quote = await providers.close(holding, session); assert.equal(quote.provider, "Yahoo"); assert.equal(quote.price, 101);
        } else await assert.rejects(providers.close(holding, session));
    }
});
test("failed crypto ETP blocks whole snapshot and surfaces attempts and safe HTTP diagnostics in log", async () => {
    const { providers } = setup(() => unavailable());
    const logs = [];
    const result = await runUserSnapshot({ userId: "u", clock: () => now, dryRun: false, providers,
        database: { input: async () => ({ ready: true, holdings: [holding], manual_assets: [], lysa_transactions: [] }),
            save: () => assert.fail("No partial valuation may save"), outcome: async (...args) => assert.equal(args[3], "failed") },
        logger: { warn: (...args) => logs.push(args) } });
    assert.equal(result.status, "failed"); assert.equal(result.diagnostics.instrument.isin, holding.isin);
    assert.deepEqual(result.diagnostics.attemptedProviders, ["Avanza", "Nordnet", "Yahoo"]);
    assert.equal(result.diagnostics.httpErrors.at(-1).normalizedSymbol, "CRYPTOETP.ST");
    assert.deepEqual(logs[0][1], { userId: "u", ...result.diagnostics });
});
test("market validation still blocks unknown codes before broker fetch", async () => {
    const { providers, calls } = setup(() => assert.fail("Must not fetch"));
    assert.throws(() => providers.close({ ...holding, market: "UNKNOWN" }, session), /listing identifier/);
    assert.throws(() => providers.close({ ...holding, ticker: "" }, session), /listing identifier/);
    assert.equal(calls.length, 0);
});

test("a broker listing on another Swedish venue is rejected despite sharing the calendar", async () => {
    const { providers } = setup((url) => url.includes("stock/A42") ? detail({ market: "XSAT" }) : unavailable());
    await assert.rejects(providers.close(holding, session), (error) => error.diagnostics.attempts[0].reason === "Unverified broker listing");
});
test("missing ISIN prohibits cross-provider ID reuse and unverified Yahoo fallback", async () => {
    const { providers, calls } = setup(() => unavailable());
    await assert.rejects(providers.close({ ...holding, isin: null }, session));
    assert.ok(calls.every((c) => !c.url.includes("nordnet")));
});
test("Nordnet price must match the verified identity, not merely be the first array element", async () => {
    const { providers } = setup((url) => url.includes("instrument_search") ? { results: [{ instrument_info: info() }] }
        : url.includes("instruments/price") ? [price({ instrument_id: "OTHER" })] : unavailable());
    await assert.rejects(providers.close({ ...holding, provider: "Nordnet", instrumentId: "N99" }, session),
        (error) => error.diagnostics.attempts[0].reason === "Unverified Nordnet quote instrument ID");
});
test("successful snapshot provenance retains broker and attempted providers", async () => {
    const { providers } = setup((url) => url.includes("avanza") ? detail() : unavailable());
    const result = await runUserSnapshot({ userId: "u", clock: () => now, providers,
        database: { input: async () => ({ ready: true, holdings: [holding], manual_assets: [], lysa_transactions: [] }) } });
    assert.equal(result.totalValueSek, 300);
    assert.equal(result.sources[0].provider, "Avanza");
    assert.deepEqual(result.sources[0].attemptedProviders, ["Avanza", "Yahoo"]);
    assert.equal(result.sources[0].sourceMetadata.provenance, "broker_latest_after_close");
});
test("broker closing timestamps follow half-day and DST session boundaries", async () => {
    for (const time of ["2026-10-30T22:30:00Z", "2026-03-30T21:30:00Z"]) {
        const observed = Date.parse(time);
        const expected = latestCompletedSession("STOCKHOLM", observed);
        const providers = createSnapshotProviders({ clock: () => observed, fetcher: async () => new Response(JSON.stringify(detail({
            quote: { last: 100, currency: "SEK", timestamp: expected.closesAt / 1000 },
        }))) });
        const quote = await providers.close(holding, expected);
        assert.equal(quote.date, expected.date); assert.equal(quote.timestamp, expected.closesAt);
    }
});

test("broker quotes just after close and at both tolerance boundaries are accepted with explicit provenance", async () => {
    for (const provider of ["Avanza", "Nordnet"]) {
        for (const offset of [-5 * 60000, 1000, 60 * 60000]) {
            const time = session.closesAt + offset;
            const { providers } = setup((url) => url.includes("stock/A42") ? detail({ quote: { last: 100, currency: "SEK", timestamp: time } })
                : url.includes("instrument_search") ? { results: [{ instrument_info: info() }] }
                    : url.includes("instruments/price/N99") ? [price({ tick_timestamp: time })] : unavailable());
            const quote = await providers.close({ ...holding, provider, instrumentId: provider === "Avanza" ? "A42" : "N99" }, session);
            assert.equal(quote.provider, provider);
            assert.equal(quote.sourceMetadata.provenance, "broker_latest_after_close");
            assert.equal(quote.sourceMetadata.offsetFromCloseSeconds, offset / 1000);
            assert.equal(quote.sourceMetadata.sessionDate, session.date);
            assert.equal(quote.timestamp, time);
        }
    }
});

test("quotes outside the small closing window are blocked", async () => {
    for (const offset of [-5 * 60000 - 1, 60 * 60000 + 1, 3 * 3600000]) {
        const { providers } = setup((url) => url.includes("stock/A42") ? detail({ quote: {
            last: 100, currency: "SEK", timestamp: session.closesAt + offset,
        } }) : unavailable());
        await assert.rejects(providers.close(holding, session), /closing price unavailable/);
    }
});

test("a future quote is blocked even when inside the permitted closing window", async () => {
    const observed = session.closesAt + 1000;
    const providers = createSnapshotProviders({ clock: () => observed, fetcher: async (url) => url.includes("stock/A42")
        ? new Response(JSON.stringify(detail({ quote: { last: 100, currency: "SEK", timestamp: observed + 1000 } }))) : unavailable() });
    await assert.rejects(providers.close(holding, session));
});

test("old-session quote and an explicitly requested old session both block broker fallback", async () => {
    const oldSession = latestCompletedSession("STOCKHOLM", Date.parse("2026-10-02T21:30:00Z"));
    for (const target of [session, oldSession]) {
        const { providers } = setup((url) => url.includes("stock/A42") ? detail({ quote: {
            last: 100, currency: "SEK", timestamp: oldSession.closesAt + 1000,
        } }) : unavailable());
        await assert.rejects(providers.close(holding, target));
    }
});

test("broker fallback is blocked while a new trading session is open", async () => {
    const openNow = Date.parse("2026-10-06T10:00:00Z");
    const providers = createSnapshotProviders({ clock: () => openNow, fetcher: async (url) => url.includes("stock/A42")
        ? new Response(JSON.stringify(detail())) : unavailable() });
    await assert.rejects(providers.close(holding, session));
});

test("verified historical close wins over an eligible broker latest price", async () => {
    const { providers, calls } = setup((url) => url.includes("stock/A42") ? detail({ quote: { last: 100, currency: "SEK", timestamp: session.closesAt + 30 * 60000 } }) : url.includes("yahoo") ? {
        chart: { result: [{ meta: { symbol: "CRYPTOETP.ST", isin: holding.isin, exchangeName: "STO",
            exchangeTimezoneName: session.zone, currency: "SEK" }, timestamp: [session.opensAt / 1000],
            indicators: { quote: [{ close: [105] }] } }] },
    } : unavailable());
    const quote = await providers.close(holding, session);
    assert.equal(quote.price, 105); assert.equal(quote.provider, "Yahoo");
    assert.equal(quote.sourceMetadata.provenance, "historical_session_close");
    assert.ok(calls[0].url.includes("avanza"));
    assert.deepEqual(quote.attemptedProviders, ["Avanza", "Yahoo"]);
});

test("invalid historical bar cannot discard an otherwise valid verified broker fallback", async () => {
    const { providers } = setup((url) => url.includes("stock/A42") ? detail() : url.includes("yahoo") ? {
        chart: { result: [{ meta: { symbol: "CRYPTOETP.ST", isin: holding.isin, exchangeName: "STO",
            exchangeTimezoneName: session.zone, currency: "SEK" }, timestamp: [session.opensAt / 1000],
            indicators: { quote: [{ close: [null] }] } }] },
    } : unavailable());
    const quote = await providers.close(holding, session);
    assert.equal(quote.price, 100); assert.equal(quote.provider, "Avanza");
    assert.equal(quote.sourceMetadata.provenance, "broker_latest_after_close");
});

test("same-provider exact instrument ID accepts absent ISIN for both brokers", async () => {
    for (const provider of ["Avanza", "Nordnet"]) {
        const { providers } = setup((url) => url.includes("stock/A42") ? detail({ isin: undefined })
            : url.includes("instrument_search") ? { results: [{ instrument_info: info({ isin: undefined }) }] }
                : url.includes("instruments/price/N99") ? [price()] : unavailable());
        const quote = await providers.close({ ...holding, provider, instrumentId: provider === "Avanza" ? "A42" : "N99" }, session);
        assert.equal(quote.provider, provider); assert.equal(quote.price, 100);
    }
});

test("cross-provider candidate missing ISIN cannot verify identity even with matching ticker and listing", async () => {
    for (const origin of ["Avanza", "Nordnet"]) {
        const { providers } = setup((url) => url.includes(origin === "Avanza" ? "avanza" : "nordnet") ? unavailable()
            : url.includes("filtered-search") ? { hits: [{ orderBookId: "A42" }] }
                : url.includes("stock/A42") ? detail({ isin: undefined })
                    : url.includes("instrument_search") ? { results: [{ instrument_info: info({ isin: undefined }) }] }
                        : url.includes("instruments/price") ? [price()] : unavailable());
        await assert.rejects(providers.close({ ...holding, provider: origin, instrumentId: origin === "Avanza" ? "A42" : "N99" }, session), (error) => {
            const cross = error.diagnostics.attempts.find((attempt) => attempt.provider !== origin && attempt.provider !== "Yahoo");
            assert.ok(JSON.stringify(cross.identityVerification).includes("ISIN missing"));
            assert.equal(cross.identityVerification.requested.instrumentId, null);
            return true;
        });
    }
});

test("conflicting ISIN blocks an exact own-provider ID for both brokers", async () => {
    for (const origin of ["Avanza", "Nordnet"]) {
        const { providers } = setup((url) => url.includes("stock/A42") && origin === "Avanza" ? detail({ isin: "CONFLICT" })
            : url.includes("instrument_search") && origin === "Nordnet" ? { results: [{ instrument_info: info({ isin: "CONFLICT" }) }] } : unavailable());
        await assert.rejects(providers.close({ ...holding, provider: origin, instrumentId: origin === "Avanza" ? "A42" : "N99" }, session), (error) => {
            const check = error.diagnostics.attempts[0].identityVerification.checks[0];
            assert.deepEqual(check.failedChecks, ["ISIN mismatch"]);
            assert.equal(check.candidate.isin, "CONFLICT"); return true;
        });
    }
});

test("identity diagnostics show requested identity, candidate values and exact failed checks without unrelated response data", async () => {
    const { providers } = setup((url) => url.includes("stock/A42") ? detail({ orderbookId: "OTHER-ID", isin: "OTHER-ISIN",
        tickerSymbol: "OTHER-TICKER", name: "Other instrument", market: "XSAT", auth: "secret-auth", access_token: "secret-token",
        headers: { Authorization: "secret-header" }, marketPlace: { name: "Spotlight", access_token: "nested-secret" } }) : unavailable());
    await assert.rejects(providers.close(holding, session), (error) => {
        const identity = error.diagnostics.attempts[0].identityVerification;
        assert.deepEqual(identity.requested, { provider: "Avanza", instrumentId: "A42", isin: holding.isin, ticker: holding.ticker, market: "XSTO" });
        const check = identity.checks[0];
        assert.deepEqual(check.failedChecks, ["instrumentId mismatch", "ISIN mismatch", "ticker mismatch", "market mismatch"]);
        assert.equal(check.candidate.name, "Other instrument"); assert.equal(check.candidate.instrumentId, "OTHER-ID");
        assert.ok(check.responseIdentityFields.some((field) => field.path === "marketPlace.name" && field.value === "Spotlight"));
        const serialized = JSON.stringify(error.diagnostics);
        for (const secret of ["secret-auth", "secret-token", "secret-header", "nested-secret", "Authorization", "Referer", "Client-Id"])
            assert.equal(serialized.includes(secret), false);
        return true;
    });
});

test("dry-run and server log expose identical Nordnet listing verification diagnostics including actual field paths", async () => {
    const { providers } = setup((url) => url.includes("avanza") ? unavailable() : url.includes("instrument_search") ? {
        results: [{ instrument_info: info({ market: "UNKNOWN", name: "Example ETP" }) }], auth: "secret",
    } : unavailable());
    const logs = [];
    const result = await runUserSnapshot({ userId: "u", clock: () => now, providers,
        database: { input: async () => ({ ready: true, holdings: [holding], manual_assets: [], lysa_transactions: [] }) },
        logger: { warn: (...args) => logs.push(args) } });
    assert.equal(result.status, "failed");
    const check = result.diagnostics.attempts.find((attempt) => attempt.provider === "Nordnet").identityVerification.checks[0];
    assert.deepEqual(check.failedChecks, ["market mismatch"]);
    assert.equal(check.candidate.instrumentId, "N99");
    assert.ok(check.responseIdentityFields.some((field) => field.path === "instrument_info.market" && field.value === "UNKNOWN"));
    assert.deepEqual(logs[0][1], { userId: "u", ...result.diagnostics });
});

test("no-candidate diagnostics retain bounded rejected search identities for both brokers", async () => {
    const { providers } = setup((url) => url.includes("instrument_search") ? { results: Array.from({ length: 8 }, (_, index) => ({
        instrument_info: info({ instrument_id: `OTHER-${index}`, isin: "OTHER-ISIN" }),
    })) } : url.includes("filtered-search") ? { hits: [{ orderBookId: "OTHER-ID", isin: "OTHER-ISIN", title: "Other name" }] } : unavailable());
    await assert.rejects(providers.close({ ...holding, provider: "Unknown", instrumentId: "untrusted" }, session), (error) => {
        const nordnet = error.diagnostics.attempts.find((attempt) => attempt.provider === "Nordnet").identityVerification.checks[0];
        assert.deepEqual(nordnet.failedChecks, ["no candidate found"]);
        assert.equal(nordnet.candidateCount, 8); assert.equal(nordnet.candidates.length, 5); assert.equal(nordnet.candidatesTruncated, true);
        const avanza = error.diagnostics.attempts.find((attempt) => attempt.provider === "Avanza").identityVerification.checks[0];
        assert.equal(avanza.candidates[0].candidate.name, "Other name");
        assert.deepEqual(avanza.candidates[0].failedChecks, ["ISIN mismatch"]);
        return true;
    });
});

test("same-provider verified identity accepts missing ticker, market and name for both brokers", async () => {
    for (const provider of ["Avanza", "Nordnet"]) {
        for (const missing of [null, undefined, ""]) {
            const { providers } = setup((url) => url.includes("stock/A42") ? detail({ tickerSymbol: missing, market: missing, name: missing })
                : url.includes("instrument_search") ? { results: [{ instrument_info: info({ symbol: missing, market: missing, name: missing }) }] }
                    : url.includes("instruments/price/N99") ? [price()] : unavailable());
            const quote = await providers.close({ ...holding, provider, instrumentId: provider === "Avanza" ? "A42" : "N99" }, session);
            assert.equal(quote.provider, provider); assert.equal(quote.price, 100);
        }
    }
});

test("same-provider exact ID alone remains sufficient when all optional identity fields are missing", async () => {
    for (const provider of ["Avanza", "Nordnet"]) {
        const { providers } = setup((url) => url.includes("stock/A42") ? detail({ isin: null, tickerSymbol: null, market: null })
            : url.includes("instrument_search") ? { results: [{ instrument_info: info({ isin: null, symbol: null, market: null }) }] }
                : url.includes("instruments/price/N99") ? [price()] : unavailable());
        const quote = await providers.close({ ...holding, provider, instrumentId: provider === "Avanza" ? "A42" : "N99" }, session);
        assert.equal(quote.provider, provider);
    }
});

test("cross-provider verified ISIN accepts missing candidate ticker and market for both brokers", async () => {
    for (const origin of ["Avanza", "Nordnet"]) {
        const { providers, calls } = setup((url) => url.includes(origin === "Avanza" ? "avanza" : "nordnet") ? unavailable()
            : url.includes("filtered-search") ? { hits: [{ orderBookId: "A42" }] }
                : url.includes("stock/A42") ? detail({ tickerSymbol: null, market: null })
                    : url.includes("instrument_search") ? { results: [{ instrument_info: info({ symbol: null, market: null }) }] }
                        : url.includes("instruments/price/N99") ? [price()] : unavailable());
        const quote = await providers.close({ ...holding, provider: origin, instrumentId: origin === "Avanza" ? "A42" : "N99" }, session);
        assert.equal(quote.provider, origin === "Avanza" ? "Nordnet" : "Avanza");
        assert.ok(calls.filter((call) => call.url.includes(origin === "Avanza" ? "nordnet" : "avanza"))
            .every((call) => !call.url.includes(origin === "Avanza" ? "A42" : "N99")));
    }
});

test("diagnostics distinguish unknown optional fields from matching primary identity", async () => {
    const { providers } = setup((url) => url.includes("stock/A42") ? detail({ tickerSymbol: null, market: null,
        quote: { last: 100, currency: "SEK", timestamp: session.closesAt - 3600000 } }) : unavailable());
    await assert.rejects(providers.close(holding, session), (error) => {
        const attempt = error.diagnostics.attempts[0];
        const check = attempt.identityVerification.checks[0];
        assert.deepEqual(check.fieldStates, { instrumentId: "match", isin: "match", ticker: "unknown", market: "unknown" });
        assert.deepEqual(check.failedChecks, []);
        assert.equal(check.identityBasis, "same_provider_instrument_id");
        assert.match(attempt.reason, /closing window/); return true;
    });
});

test("explicit ticker or market contradictions still block even when the other field is unknown", async () => {
    for (const provider of ["Avanza", "Nordnet"]) {
        for (const field of ["ticker", "market"]) {
            const ticker = field === "ticker" ? "OTHER" : null;
            const market = field === "market" ? "XSAT" : null;
            const { providers } = setup((url) => url.includes("stock/A42") && provider === "Avanza" ? detail({ tickerSymbol: ticker, market })
                : url.includes("instrument_search") && provider === "Nordnet" ? { results: [{ instrument_info: info({ symbol: ticker, market }) }] } : unavailable());
            await assert.rejects(providers.close({ ...holding, provider, instrumentId: provider === "Avanza" ? "A42" : "N99" }, session), (error) => {
                const check = error.diagnostics.attempts[0].identityVerification.checks[0];
                assert.deepEqual(check.failedChecks, [`${field} mismatch`]);
                assert.equal(check.fieldStates[field], "mismatch");
                assert.equal(check.fieldStates[field === "ticker" ? "market" : "ticker"], "unknown"); return true;
            });
        }
    }
});

test("missing own-provider ID cannot be replaced by matching ISIN, ticker or name", async () => {
    const { providers } = setup((url) => url.includes("stock/A42") ? detail({ orderbookId: null, name: holding.name }) : unavailable());
    await assert.rejects(providers.close(holding, session), (error) => {
        const check = error.diagnostics.attempts[0].identityVerification.checks[0];
        assert.equal(check.fieldStates.instrumentId, "unknown");
        assert.deepEqual(check.failedChecks, ["instrumentId missing"]);
        assert.equal(check.identityBasis, null); return true;
    });
});

test("cross-provider explicit ticker contradiction blocks even with verified ISIN and unknown market", async () => {
    const { providers } = setup((url) => url.includes("avanza") ? unavailable() : url.includes("instrument_search")
        ? { results: [{ instrument_info: info({ symbol: "OTHER", market: null }) }] } : unavailable());
    await assert.rejects(providers.close(holding, session), (error) => {
        const check = error.diagnostics.attempts.find((attempt) => attempt.provider === "Nordnet").identityVerification.checks[0];
        assert.equal(check.fieldStates.isin, "match"); assert.equal(check.fieldStates.market, "unknown");
        assert.deepEqual(check.failedChecks, ["ticker mismatch"]); return true;
    });
});

test("verified same-session broker prices at +30 and +60 minutes are accepted with broker provenance", async () => {
    for (const provider of ["Avanza", "Nordnet"]) {
        for (const minutes of [30, 60]) {
            const sourceTime = session.closesAt + minutes * 60000;
            const { providers } = setup((url) => url.includes("stock/A42") ? detail({ quote: { last: 100, currency: "SEK", timestamp: sourceTime } })
                : url.includes("instrument_search") ? { results: [{ instrument_info: info() }] }
                    : url.includes("instruments/price/N99") ? [price({ tick_timestamp: sourceTime })] : unavailable());
            const quote = await providers.close({ ...holding, provider, instrumentId: provider === "Avanza" ? "A42" : "N99" }, session);
            assert.equal(quote.provider, provider); assert.equal(quote.date, session.date);
            assert.equal(quote.sourceMetadata.provenance, "broker_latest_after_close");
            assert.equal(quote.sourceMetadata.offsetFromCloseSeconds, minutes * 60);
            assert.equal(quote.sourceMetadata.toleranceBeforeSeconds, 300);
            assert.equal(quote.sourceMetadata.toleranceAfterSeconds, 3600);
        }
    }
});

test("missing Avanza timestamp is rejected while verified Nordnet +30 minute quote can supply fallback", async () => {
    const { providers } = setup((url) => url.includes("stock/A42") ? detail({ quote: { last: 100, currency: "SEK" } })
        : url.includes("instrument_search") ? { results: [{ instrument_info: info({ market: null }) }] }
            : url.includes("instruments/price/N99") ? [price({ tick_timestamp: session.closesAt + 30 * 60000 })] : unavailable());
    const quote = await providers.close(holding, session);
    assert.equal(quote.provider, "Nordnet"); assert.equal(quote.sourceMetadata.provenance, "broker_latest_after_close");
    assert.deepEqual(quote.attemptedProviders, ["Avanza", "Nordnet", "Yahoo"]);
});
