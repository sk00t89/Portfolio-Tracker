import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { INDEXES, INDEX_HISTORY_VERSION } from '../supabase/functions/_shared/indexHistory.js';

test('standalone index uses existing chart with percent, native currency, base date, gap and ALL notices', async () => {
    const bundle=await build({configFile:false,plugins:[react()],logLevel:'silent',
        build:{ssr:'src/components/StandaloneIndex.jsx',write:false,minify:false}});
    const code=bundle.output.find(x=>x.type==='chunk').code.replace(/from "(react(?:\/jsx-runtime)?)"/g,
        (_,name)=>`from ${JSON.stringify(import.meta.resolve(name))}`);
    const {default:Index,IndexHistoryContent}=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
    for (const id of ['OMXS30','SP500']) {
        const data={apiVersion:INDEX_HISTORY_VERSION,id,...INDEXES[id],period:'All',requestedStart:'2016-10-09',
            missing:5,points:[{date:'2016-10-10',value:100},{date:'2026-10-08',value:110}]};
        const markup=renderToStaticMarkup(createElement(IndexHistoryContent,{data,onFocus:()=>{}}));
        assert.match(markup,/högst 10 års indexhistorik/);
        assert.match(markup,/Basdatum 2016-10-10 = 0 %/);
        assert.match(markup,/Historiken börjar efter periodgränsen/);
        assert.match(markup,/5 dagsstaplar saknar slutkurs/);
        assert.match(markup,/\+10.00 %/);
        assert.match(markup,new RegExp(`prisindex i ${data.currency}`));
        assert.match(markup,/portfolio-index-line/);
        assert.doesNotMatch(markup,/Portföljvärde|Över index|Under index/);
        const single=renderToStaticMarkup(createElement(IndexHistoryContent,{data:{...data,points:[data.points[0]]},onFocus:()=>{}}));
        assert.match(single,/Endast en observation/);
        assert.doesNotMatch(single,/<polyline|<polygon/);
    }
    const intraday=renderToStaticMarkup(createElement(Index,{id:'OMXS30',period:'1D'}));
    assert.match(intraday,/Ingen intradagsdata/);assert.doesNotMatch(intraday,/<svg/);
    const loading=renderToStaticMarkup(createElement(Index,{id:'SP500',period:'1M'}));
    assert.match(loading,/Hämtar indexhistorik/);assert.doesNotMatch(loading,/<svg/);
});
