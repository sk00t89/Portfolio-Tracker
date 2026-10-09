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
    assert.match(initial, /Från första sparade observationen · 2026-10-04/);
    assert.match(initial, /inte från när portföljen skapades/);
    assert.match(initial, /IDAG/);
    assert.match(initial, /0.08 %/);
    assert.equal((initial.match(/<section/g) ?? []).length, 1, 'history is inside the same card');
    assert.ok(initial.indexOf('portfolio-chart-svg') < initial.indexOf('Underlag och förklaringar'));
    const ordered = render({children:createElement('div',null,'Prioriterade innehav')});
    assert.ok(ordered.indexOf('portfolio-chart-svg') < ordered.indexOf('Prioriterade innehav'));
    assert.ok(ordered.indexOf('Prioriterade innehav') < ordered.indexOf('Underlag och förklaringar'));
    assert.equal((initial.match(/aria-pressed=/g) ?? []).length, 7);
    assert.match(initial, /<select aria-label="Jämför med index"/);
    assert.doesNotMatch(initial, /<select[^>]+disabled=""/);
    assert.match(initial, /<option value="SIXRX" disabled=""/);
    assert.match(initial, /Välj ett index för jämförelse/);
    assert.match(render({initialIndex:'OMXS30', history:{points:[]}}), /Din historik börjar här/);
    assert.match(render({initialIndex:'SP500', initialPeriod:'1D', history:{points:[]}}), /ingen intradagskurva/i);
    assert.match(render({initialIndex:'OMXS30'}), /Jämförelse mot portföljen är avstängd/);
    for (const initialIndex of ['OMXS30','SP500']) {
        const selected = render({initialIndex});
        assert.match(selected,/Portföljvärde i SEK från 2026-10-04 till 2026-10-08/);
        assert.match(selected,/överlägg ej tillgängligt/);
        assert.doesNotMatch(selected,/Hämtar indexhistorik|Separat index|portfolio-index-line/);
        const failed = render({initialIndex,history:{...props.history,error:'Historikfel'}});
        assert.match(failed,/role="alert">Historikfel/,'index choice never hides the portfolio error');
    }
    assert.match(initial, /2 verkliga observationer/);
    const refreshing = render({ updatingPrices: true });
    assert.match(refreshing, /Uppdaterar kurser/);
    assert.match(refreshing, /<h1>125000 SEK<\/h1>/, 'refresh keeps the saved total');
    const partial = render({ dailyChange: { complete: false, coveragePercent: 67.9, changeSek: 999999, reasons: ['Ofullständiga valutakurser'] } });
    assert.match(partial, /Dagsunderlag saknas/);
    assert.ok(initial.indexOf('portfolio-chart-svg') < initial.indexOf('<summary>Dagens underlag'), 'observed graph precedes collapsed diagnostics');
    assert.doesNotMatch(initial, /<details[^>]*\bopen(?:=|\s|>)/, 'optional explanations are closed by default');
    const diagnostic = render({dailyChange:{complete:false,coveragePercent:67,instrumentCoveragePercent:100,sekCoveragePercent:67,
        referenceFx:true,reasons:['NAV för idag saknas'],positions:[{id:'f',name:'Avanza Zero',kind:'nav',covered:false,reasons:['Senaste NAV 2026-10-07'],
            diagnostic:{source:'Avanza',referenceCheckedAt:Date.parse('2026-10-08T12:00:00Z'),lastAttemptAt:Date.parse('2026-10-08T12:30:00Z'),referenceValid:true},
            navChange:{label:'Senast publicerade NAV-förändring',date:'2026-10-07',previousDate:'2026-10-06',percent:-1}}]}});
    assert.match(diagnostic,/Senaste instrumentkurser 100 %/);assert.match(diagnostic,/Dagsförändring i SEK 67 %/);
    assert.match(diagnostic,/Dagliga referensvalutakurser från Frankfurter/);
    assert.match(diagnostic,/Underlag per innehav/);assert.match(diagnostic,/Avanza Zero/);assert.match(diagnostic,/2026-10-06 → 2026-10-07/);
    assert.match(diagnostic,/Senast publicerade fond-NAV/);
    assert.match(diagnostic,/NAV-värderingsdatum: saknas; publiceringstid saknas/);
    assert.match(diagnostic,/Källa: Avanza/);assert.match(diagnostic,/Referensgiltighet: verifierad daterad observation/);
    assert.match(diagnostic,/senaste hämtningsförsök/);
    const subset = render({dailyChange:{complete:false,instrumentCoveragePercent:100,sekCoveragePercent:42,reasons:['NAV för idag saknas'],
        subset:{available:true,currentDate:'2026-10-08',previousDate:'2026-10-07',changeSek:420,changePercent:2.1,
            portfolioValueSek:52500,coveragePercent:42,positionCount:12},positions:[]}});
    assert.match(subset,/Delmängd · 42,0 % täckning/);assert.match(subset,/\+420 kr/);assert.match(subset,/2.10 %/);
    assert.match(subset,/inte totalportföljen/);assert.match(subset,/42.0 % täckning/);assert.match(subset,/12 positioner/);
    const compactSubset = subset.slice(subset.indexOf('portfolio-hero-metrics'),subset.indexOf('<figure'));
    assert.match(compactSubset,/Delmängd · 42,0 % täckning/);
    assert.doesNotMatch(compactSubset,/2026-10-08|12 innehav/,'dates and counts stay in expandable details');
    assert.doesNotMatch(compactSubset,/Frankfurter|NAV för idag saknas|Senaste instrumentkurser/,'technical details move below the observed graph');
    for (const initialPeriod of ['1D','1V','1M','3M','YTD','1Å','ALL']) {
        for (const initialIndex of ['', 'OMXS30', 'SP500']) {
            const markup = render({initialPeriod, initialIndex, currency:'USD', formatMoney:value=>`${value} USD`});
            const metrics = markup.slice(markup.indexOf('portfolio-hero-metrics'), markup.indexOf('</section>'));
            assert.ok(metrics.indexOf('IDAG') < metrics.indexOf('förändring ·'), 'IDAG remains above the secondary metrics');
            assert.ok(markup.indexOf('portfolio-secondary-metrics') > markup.indexOf('portfolio-chart-toolbar'));
            assert.ok(markup.indexOf('portfolio-today-metric') < markup.indexOf('portfolio-chart-toolbar'));
            assert.ok(metrics.indexOf('förändring ·') < metrics.indexOf('Kapitalförändring'), 'capital remains right');
            assert.match(metrics,/\+100 kr/,'IDAG always uses SEK despite display currency or index');
            assert.match(metrics,/\+0.08 %/);
        }
    }
    const previous = render({dailyChange:{today:{complete:false,currentDate:'2026-10-08',reasons:['Börsen har inte öppnat'],
        subset:null},latestSessionSubsets:[{previousDate:'2026-10-06',currentDate:'2026-10-07',changeSek:123456,
            changePercent:1,positionCount:1,coveragePercent:50}],positions:[]}});
    assert.doesNotMatch(previous.slice(previous.indexOf('portfolio-hero-metrics'),previous.indexOf('<details')),/123/);
    assert.match(previous,/Senaste verifierade handelssessioner · inte IDAG/);
    const loadingSubset = render({valuesLoading:true,dailyChange:{complete:false,subset:{available:true,changeSek:999999,changePercent:2}}});
    assert.doesNotMatch(loadingSubset,/999999|DELMÄNGD/);
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
