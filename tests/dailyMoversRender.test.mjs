import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'vite';
import react from '@vitejs/plugin-react';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

test('course contribution cards show one actual ranked instrument per category with optional expansion',async()=>{
    const bundle=await build({configFile:false,plugins:[react()],logLevel:'silent',build:{ssr:'src/components/DailyMovers.jsx',write:false,minify:false}});
    const code=bundle.output.find(x=>x.type==='chunk').code.replace(/from "(react(?:\/jsx-runtime)?)"/g,(_,name)=>`from ${JSON.stringify(import.meta.resolve(name))}`);
    const {default:Movers}=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
    const now=Date.parse('2026-10-08T12:00:00Z');
    const make=(name,price)=>({name,ticker:name,market:'XSTO',assetType:'STOCK',quantity:1,currentPrice:price,previousClose:100,currentValueSek:price,priceUpdatedAt:now});
    const render=holdings=>renderToStaticMarkup(createElement(Movers,{holdings,currency:'SEK',now}));
    const long='Ett mycket långt instrumentnamn som måste brytas på smala mobilskärmar';
    const markup=render([make(long,130),make('Andra positiva',120),make('Tredje positiva',110),make('Negativa',90)]);
    assert.match(markup,/Kursbidrag · inte portföljens IDAG/);
    assert.equal((markup.match(/class="daily-mover-row"/g)??[]).length,2);
    assert.ok(markup.includes(long));assert.match(markup,/Negativa/);
    assert.doesNotMatch(markup,/Andra positiva|Tredje positiva/);
    assert.match(markup,/aria-expanded="false">Visa fler kursbidrag/);
    const empty=render([]);assert.match(empty,/Inga positiva/);assert.match(empty,/Inga negativa/);assert.doesNotMatch(empty,/Visa fler kursbidrag/);
    const single=render([make(long,110)]);assert.equal((single.match(/class="daily-mover-row"/g)??[]).length,1);assert.doesNotMatch(single,/Visa fler kursbidrag/);
});

