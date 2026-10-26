import {build} from 'vite';
import fs from 'node:fs';
// Keep the existing Vite SPA; add a small ESM API Worker alongside its assets.
await build({configFile:false,publicDir:false,build:{ssr:'worker/index.mjs',outDir:'dist/server',emptyOutDir:true,rollupOptions:{output:{entryFileNames:'index.js'}}}});
const hosting=JSON.parse(fs.readFileSync('.openai/hosting.json'));
fs.mkdirSync('dist/.openai',{recursive:true});
fs.writeFileSync('dist/.openai/hosting.json',JSON.stringify(hosting,null,2));
fs.writeFileSync('dist/server/wrangler.json',JSON.stringify({name:'knowledge-map',main:'index.js',compatibility_date:'2026-10-26',assets:{directory:'../client',binding:'ASSETS',not_found_handling:'single-page-application',run_worker_first:['/api/*']},d1_databases:[{binding:hosting.d1,database_name:'knowledge-map',database_id:'00000000-0000-4000-8000-000000000000'}]},null,2));
