import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'vite';
import react from '@vitejs/plugin-react';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {chartPointerDirection} from '../src/utils/chartPointerGesture.js';
import {nearestHistoryPoint} from '../src/utils/portfolioPeriod.js';

test('touch waits for intent, allows vertical scrolling and scrubs horizontally', () => {
    const start={x:20,y:20};
    assert.equal(chartPointerDirection(start,{x:22,y:24}),'pending');
    assert.equal(chartPointerDirection(start,{x:21,y:40}),'vertical');
    assert.equal(chartPointerDirection(start,{x:40,y:22}),'horizontal');
    assert.equal(chartPointerDirection(start,{x:30,y:30}),'vertical');
});

test('sparse history selection returns an actual observation, including outside bounds', () => {
    const points=[{date:'2026-10-01',valueSek:101},{date:'2026-10-08',valueSek:207}];
    assert.equal(nearestHistoryPoint(points,0.3),points[0]);
    assert.equal(nearestHistoryPoint(points,0.9),points[1]);
    assert.equal(nearestHistoryPoint(points,-1),points[0]);
    assert.equal(nearestHistoryPoint(points,2),points[1]);
    assert.equal(nearestHistoryPoint([points[0]],0.9),points[0]);
    assert.equal(nearestHistoryPoint([],0.5),null);
});

test('tooltip reports the saved SEK observation despite display currency, and labels live separately', async () => {
    const bundle=await build({configFile:false,plugins:[react()],logLevel:'silent',build:{ssr:'src/components/PortfolioHistoryChart.jsx',write:false,minify:false}});
    const code=bundle.output.find(x=>x.type==='chunk').code.replace(/from "(react(?:\/jsx-runtime)?)"/g,(_,name)=>`from ${JSON.stringify(import.meta.resolve(name))}`);
    const {default:Chart}=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
    const points=[{date:'2026-10-01',valueSek:101},{date:'2026-10-08',valueSek:207}];
    const render=(observations,focused)=>renderToStaticMarkup(createElement(Chart,{view:{available:true,comparison:{available:false},points:observations,visibleChangeSek:106},focused,onFocus:()=>{},currency:'USD',formatMoney:v=>`${v} displayed USD`}));
    const markup=render(points,points[0].date);
    const tooltip=markup.slice(markup.indexOf('role="tooltip"'),markup.indexOf('<svg'));
    assert.match(tooltip,/2026-10-01 · Sparat portföljvärde/);
    assert.match(tooltip,/101/);assert.match(tooltip,/kr/);assert.doesNotMatch(tooltip,/USD|207/);
    const single=render([points[0]],points[0].date);
    assert.match(single,/role="tooltip"/);assert.doesNotMatch(single,/<polyline|<polygon/);
    assert.match(render([{...points[0],live:true}],points[0].date),/Verifierat livevärde/);
});
