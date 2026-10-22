// Review-only portable output. Never publishes, mutates archives, or alters workflows.
import { build } from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
const root = process.cwd();
const payload = JSON.parse(await fs.readFile('public/data/search-index.json', 'utf8'));
const source = `import React from 'react';
import { createRoot } from 'react-dom/client';
import { Catchup } from './src/components/Catchup';
import './src/reading.css';
const payload = ${JSON.stringify(payload)};
function Preview() {
 const [english,setEnglish] = React.useState(false);
 const [dark,setDark] = React.useState(false);
 React.useEffect(()=>{document.documentElement.lang=english?'en':'zh-CN'},[english]);
 const index = {schemaVersion:1,updatedAt:payload.updatedAt,entries:payload.items.filter(i=>!english || i.copy.en).map(i=>({editionId:i.editionId,entryId:i.entryId,issueNumber:i.issue,date:i.date,period:i.period,titleKey:i.titleKey,section:i.section,titleStatus:i.titleStatus,titleZhCn:i.titleZhCn,titleEn:i.titleEn,headline:i.copy[english?'en':'zh-CN'].headline,summary:i.copy[english?'en':'zh-CN'].summary,platforms:i.platforms,region:i.region,factStatus:i.factStatus}))};
 return <div className="reading-app" data-theme={dark?'dark':'light'} data-accent="orange"><header className="r-header"><div className="r-header-inner"><a className="r-brand" href="https://fallw1nd.github.io/daily-game-brief/">游戏圈动态</a><div className="r-controls"><button onClick={()=>setEnglish(!english)}>{english?'中文':'EN'}</button><button onClick={()=>setDark(!dark)}>{dark?'Light / 日间':'Dark / 夜间'}</button></div></div></header><main className="r-container"><Catchup reviewOnly key={String(english)} index={index} english={english} error={false} onRetry={()=>{}} onClose={()=>{window.location.href='https://fallw1nd.github.io/daily-game-brief/'}} /></main></div>;
}
document.body.className='reading-page';createRoot(document.getElementById('root')).render(<Preview/>);`;
const result = await build({stdin:{contents:source,loader:'tsx',resolveDir:root},bundle:true,jsx:'automatic',write:false,outdir:'preview-artifacts',minify:true,format:'iife',define:{'import.meta.env.BASE_URL':JSON.stringify('https://fallw1nd.github.io/daily-game-brief/'),'process.env.NODE_ENV':'"production"'},loader:{'.css':'css'}});
const js=result.outputFiles.find(f=>f.path.endsWith('.js')).text.replace(/<\/script/gi,'<\\/script');
const css=result.outputFiles.find(f=>f.path.endsWith('.css')).text;
await fs.mkdir('preview-artifacts',{recursive:true});
await fs.writeFile(path.join(root,'preview-artifacts/offline-catchup-preview.html'),`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>离线补课 · 功能预览</title><style>${css}</style></head><body><div id="root"></div><script>${js}</script></body></html>`);
console.log('Portable preview written (embedded index, no network required until opening an original edition).');
