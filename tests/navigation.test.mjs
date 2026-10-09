import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'vite';
import react from '@vitejs/plugin-react';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {MemoryRouter} from 'react-router-dom';

test('shared navigation preserves routes, active section and holdings attention badge', async()=>{
    const bundle=await build({configFile:false,plugins:[react()],logLevel:'silent',build:{ssr:'src/components/NavigationLinks.jsx',write:false,minify:false}});
    const code=bundle.output.find(x=>x.type==='chunk').code.replace(/from "(react(?:\/jsx-runtime)?|react-router-dom)"/g,(_,name)=>`from ${JSON.stringify(import.meta.resolve(name))}`);
    const {default:Links}=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
    const markup=renderToStaticMarkup(createElement(MemoryRouter,{initialEntries:['/holdings']},createElement(Links,{holdingsAttentionCount:3})));
    assert.equal((markup.match(/<ul/g)??[]).length,1,'one navigation tree for both layouts');
    for(const path of ['/','/holdings','/import','/settings','/help'])assert.ok(markup.includes(`href="${path}"`));
    assert.match(markup,/aria-current="page" class="nav-link active" href="\/holdings"/);
    assert.match(markup,/3 saker behöver din uppmärksamhet/);
    assert.match(markup,/class="nav-help-link"/);
    assert.match(markup,/Dashboard/);
});
