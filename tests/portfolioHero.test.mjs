import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

test('integrated hero preserves current total, deposited capital, daily coverage and genuine history', async () => {
    // Build in memory: exercise JSX through the same Vite compiler without a dev server or database.
    const bundle = await build({ configFile: false, plugins: [react()], logLevel: 'silent',
        build: { ssr: 'src/components/PortfolioSummary.jsx', write: false, minify: false } });
    const code = bundle.output.find(item => item.type === 'chunk').code
        .replace(/from "(react(?:\/jsx-runtime)?)"/g, (_, name) => `from ${JSON.stringify(import.meta.resolve(name))}`);
    const { default: Summary } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
    const props = { portfolioValue: 125000, investedCapital: 80000,
        formatMoney: value => `${value} SEK`, today: '2026-10-08', now: Date.parse('2026-10-08T22:00:00Z'),
        history: { points: [{ date: '2026-10-04', valueSek: 100000 }, { date: '2026-10-08', valueSek: 120000 }] },
        dailyChange: { complete: true, changeSek: 100, changePercent: 0.08 } };
    const render = overrides => renderToStaticMarkup(createElement(Summary, { ...props, ...overrides }));
    const initial = render();
    assert.match(initial, /<h1>125000 SEK<\/h1>/, 'latest live total stays separate from last history observation');
    assert.match(initial, /80000 SEK/);
    assert.match(initial, /45000 SEK/);
    assert.match(initial, /Idag/);
    assert.match(initial, /0.08 %/);
    assert.equal((initial.match(/<section/g) ?? []).length, 1, 'history is inside the same card');
    assert.equal((initial.match(/aria-pressed=/g) ?? []).length, 7);
    assert.match(initial, /<select[^>]+disabled=""/);
    assert.match(initial, /Ingen verifierad indexkälla är ansluten/);
    assert.match(initial, /2 verkliga observationer/);
    const refreshing = render({ updatingPrices: true });
    assert.match(refreshing, /Uppdaterar kurser/);
    assert.match(refreshing, /<h1>125000 SEK<\/h1>/, 'refresh keeps the saved total');
    const partial = render({ dailyChange: { complete: false, coveragePercent: 67.9, changeSek: 999999, reasons: ['Ofullständiga valutakurser'] } });
    assert.match(partial, /67 % kurstäckning/);
    assert.doesNotMatch(partial, /999999/);
    assert.match(partial, /2 verkliga observationer/, 'incomplete current quotes do not hide valid historical snapshots');
    assert.match(render({ history: { points: [] } }), /Din historik börjar här/);
    const single = render({ history: { points: [props.history.points[0]] } });
    assert.match(single, /1 verkliga observationer/);
    assert.doesNotMatch(single, /<polyline|<polygon/, 'one observation cannot create a line or filled triangle');
    const liveNow = Date.parse('2026-10-08T12:00:00Z');
    const liveMarkup = render({now:liveNow,liveValuation:{verified:true,userId:'u',publication:{userId:'u',observedAt:liveNow}}});
    assert.match(liveMarkup,/Dagens slutpunkt är ett verifierat livevärde/);
    assert.match(liveMarkup,/<h1>125000 SEK<\/h1>/);
    assert.match(liveMarkup,/Live · 2026-10-08/);
    for (const initialPeriod of ['1V','1M','3M','YTD','1Å']) {
        const partialHistory = render({initialPeriod,now:liveNow,
            liveValuation:{verified:true,userId:'u',publication:{userId:'u',observedAt:liveNow}}});
        assert.match(partialHistory,/2 verkliga observationer/);
        assert.match(partialHistory,/Historik tillgänglig sedan 4 oktober 2026/);
        assert.match(partialHistory,/Periodens avkastning kan ännu inte beräknas/);
        assert.match(partialHistory,/Live · 2026-10-08/);
        assert.doesNotMatch(partialHistory,/\+25000 SEK|\+25.00 %/,'partial history cannot claim the selected full-period return');
    }
});
