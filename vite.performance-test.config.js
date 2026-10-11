import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({root:'performance-test',plugins:[react()],
    server:{host:'127.0.0.1',port:55800,strictPort:true,proxy:{'/api':'http://127.0.0.1:55801'}},
    build:{outDir:'dist',emptyOutDir:true}});
