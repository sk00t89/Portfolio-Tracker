import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';

// Separate entry and env directory; never loads the production root .env files.
export default defineConfig({root:'staging-app',envDir:'.',plugins:[react(),{
    name:'reject-legacy-staging-dependencies',
    load(moduleId) {
        const id=moduleId.replaceAll('\\','/');
        if(/\/src\/(?:App\.jsx|lib\/supabase\.js|services\/(?:apiClient|authService|database)\.js|pages\/Dashboard\.jsx|localTest\/PerformanceTestApp\.jsx)$/.test(id))
            throw new Error(`Legacy dependency forbidden in staging: ${id}`);
        return null;
    },
}],server:{host:'127.0.0.1',port:55810,strictPort:true},build:{outDir:'dist',emptyOutDir:true}});
