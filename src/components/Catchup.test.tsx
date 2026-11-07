import { act, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Catchup } from './Catchup';
import type { BriefSearchIndex } from '../types';
let root: Root;
const index: BriefSearchIndex = { schemaVersion:1, updatedAt:'2026-10-19', entries:Array.from({length:16},(_,i)=>({editionId:`edition-${i}`,entryId:`story-${i}`,issueNumber:i,date:i === 0 ? '2026-09-21' : '2026-10-19',period:'daily',titleKey:i%2?'a':'b',titleEn:i%2?'Game A':'Company B',titleZhCn:i%2?'游戏甲':'公司乙',headline:`Headline ${i}`,summary:`Summary ${i}`,platforms:['PC'],region:'Global',factStatus:i===1?'unconfirmed':i===2?'media_report':'official',section:i===1?'rumors':'news'})) };
beforeEach(()=>{window.history.replaceState(null, "", "/daily-game-brief/?catchup=1");document.body.innerHTML='<div id="root"></div>';root=createRoot(document.getElementById('root')!);Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});});
afterEach(async()=>{await act(async()=>root.unmount());vi.restoreAllMocks();});
async function render(props: Partial<Parameters<typeof Catchup>[0]>={}) { await act(async()=>root.render(<StrictMode><Catchup index={index} english={false} error={false} onRetry={()=>{}} onClose={()=>{}} {...props}/></StrictMode>)); }
async function click(text:string) { const b=Array.from(document.querySelectorAll('button')).find(b=>b.textContent===text)!;expect(b).toBeTruthy();await act(async()=>b.click()); }
it('renders inclusive presets, oldest-first stories, pagination and original anchored links',async()=>{await render();expect(document.querySelector('.cu-range')?.textContent).toContain('2026-10-13 — 2026-10-19 · 15');expect(document.querySelectorAll('.cu-story')).toHaveLength(12);await click('再看 12 条（剩余 3 条）');expect(document.querySelectorAll('.cu-story')).toHaveLength(15);await click('近 30 天');expect(document.querySelector('.cu-range')?.textContent).toContain('2026-09-20 — 2026-10-19 · 16');expect(document.querySelector('.cu-story h3')?.textContent).toBe('Headline 0');expect(document.querySelector('.cu-story a')?.getAttribute('href')).toContain('?view=reading&edition=edition-0#story-0');});
it('opens a topic dossier without confusing a company for a game and keeps media vs rumor labels',async()=>{await render();const select=document.querySelector('select')!;await act(async()=>{select.value='b';select.dispatchEvent(new Event('change',{bubbles:true}));});expect(document.querySelector('.cu-results-heading h2')?.textContent).toBe('公司乙');expect(document.querySelectorAll('.cu-story')).toHaveLength(7);expect(document.querySelector('.cu-timeline')?.textContent).toContain('媒体报道');await click('全部主题');expect(document.querySelector('.cu-timeline')?.textContent).toContain('传闻 / 未证实');});
it('validates custom dates and shows honest empty results',async()=>{await render();await click('自定义');const inputs=document.querySelectorAll('input');async function fill(i:number,value:string){await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(inputs[i],value);inputs[i].dispatchEvent(new Event('input',{bubbles:true}));inputs[i].dispatchEvent(new Event('change',{bubbles:true}));});}await fill(0,'2027-01-01');await fill(1,'2027-01-02');expect(document.querySelector('.cu-empty')?.textContent).toContain('不代表没有新消息');await fill(0,'2027-02-01');expect(document.querySelector('.cu-range')?.textContent).toContain('开始不能晚于结束');expect(document.querySelectorAll('.cu-story')).toHaveLength(0);});
it('fails safely and retries without substituting data',async()=>{const retry=vi.fn();await render({index:undefined,error:true,onRetry:retry});expect(document.querySelector('[role=alert]')?.textContent).toContain('日报仍可正常阅读');await click('重试');expect(retry).toHaveBeenCalledOnce();expect(document.querySelectorAll('.cu-story')).toHaveLength(0);});
it('supports English coverage and empty index',async()=>{await render({english:true,index:{schemaVersion:1,updatedAt:'',entries:[]}});expect(document.body.textContent).toContain('Coverage');expect(document.body.textContent).toContain('No indexed stories are available');expect(document.body.textContent).not.toContain('Invalid Date');});

it('keeps provisional naming separate from official event evidence', async()=>{ const provisional = {...index.entries[1], titleZhCn:'游戏甲（Game A，暂译）',titleStatus:'provisional_translation' as const,factStatus:'official' as const,section:'news' as const};await render({index:{...index,entries:[provisional]}});expect(document.querySelector('.cu-story-meta')?.textContent).toContain('译名：助手暂译（非官方）');expect(document.querySelector('.cu-story-meta')?.textContent).toContain('官方消息');expect(document.querySelector('.cu-story-meta')?.textContent).not.toContain('传闻 / 未证实');await render({english:true,index:{...index,entries:[provisional]}});expect(document.querySelector('.cu-story-meta')?.textContent).not.toContain('助手暂译');});

it('shows production copy by default and an explicit badge only in review wrappers',async()=>{await render();expect(document.querySelector('.cu-top')?.textContent).toContain('从已发布日报中整理');expect(document.querySelector('.cu-top')?.textContent).not.toContain('功能预览');await render({reviewOnly:true});expect(document.querySelector('.cu-top')?.textContent).toContain('功能预览 · 独立审阅快照');});


it('restores a linked topic, dates and expanded result count after remount and popstate', async () => {
  window.history.replaceState(null, '', '?catchup=1&cuDays=30&cuTo=2026-10-19&cuLimit=24');
  await render();
  expect(document.querySelectorAll('.cu-story')).toHaveLength(16);
  await click('近 7 天');
  expect(new URLSearchParams(window.location.search).get('cuDays')).toBe('7');
  await act(async () => {
    window.history.replaceState(null, '', '?catchup=1&cuDays=all&cuTopic=b');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  expect(document.querySelector('.cu-results-heading h2')?.textContent).toBe('公司乙');
  expect(document.querySelectorAll('.cu-story')).toHaveLength(8);
  await act(async () => root.unmount());
  root = createRoot(document.getElementById('root')!);
  await render();
  expect(document.querySelector('select')?.value).toBe('b');
  expect(document.querySelectorAll('.cu-story')).toHaveLength(8);
});

it('counts topics within the selected dates and shows unknown linked topics honestly', async () => {
  await render();
  expect(document.querySelector('option[value="b"]')?.textContent).toBe('公司乙 · 7');
  await click('全部收录');
  expect(document.querySelector('option[value="b"]')?.textContent).toBe('公司乙 · 8');
  await act(async () => {
    window.history.replaceState(null, '', '?catchup=1&cuTopic=missing');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  expect(document.querySelector('select')?.value).toBe('missing');
  expect(document.querySelector('.cu-results-heading h2')?.textContent).toBe('此主题未收录');
  expect(document.querySelectorAll('.cu-story')).toHaveLength(0);
});

it('copies a stable date range and provides a selectable fallback if clipboard is unavailable', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  await render();
  await click('复制这份补课');
  const url = new URL(writeText.mock.calls[0][0]);
  expect(url.searchParams.get('cuFrom')).toBe('2026-10-13');
  expect(url.searchParams.get('cuTo')).toBe('2026-10-19');
  expect(document.querySelector('.cu-share [role=status]')?.textContent).toContain('链接已复制');
  writeText.mockRejectedValue(new Error('Clipboard blocked'));
  await click('复制这份补课');
  expect(document.querySelector<HTMLInputElement>('.cu-share input')?.value).toBe(url.href);
  await click('近 30 天');
  expect(document.querySelector('.cu-share input')).toBeNull();
  expect(document.querySelector('.cu-share [role=status]')?.textContent).toBe('');
});

it('does not announce a stale clipboard response after the filters change', async () => {
  let complete!: () => void;
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => new Promise<void>(resolve => { complete = resolve; }) } });
  await render();
  await click('复制这份补课');
  await click('全部收录');
  await act(async () => complete());
  expect(document.querySelector('.cu-share [role=status]')?.textContent).toBe('');
});

it('pins the source-page history entry and restores its scroll after the index loads', async () => {
  await render();
  await click('再看 12 条（剩余 3 条）');
  const link = document.querySelector<HTMLAnchorElement>('.cu-story a')!;
  link.addEventListener('click', event => event.preventDefault());
  Object.defineProperty(window, 'scrollY', { configurable: true, value: 640 });
  await act(async () => link.click());
  expect(window.history.state.catchupPosition).toEqual({ search: window.location.search, y: 640 });
  expect(new URLSearchParams(window.location.search).get('cuLimit')).toBe('24');
  const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  await act(async () => root.unmount());
  root = createRoot(document.getElementById('root')!);
  await render({ index: undefined });
  expect(scroll).not.toHaveBeenCalled();
  await render();
  await new Promise(resolve => setTimeout(resolve, 60));
  expect(scroll).toHaveBeenCalledWith({ top: 640, behavior: 'instant' });
  expect(document.querySelectorAll('.cu-story')).toHaveLength(15);
});


it.each([false, true])('shows one reviewed GTA VI dossier from an old link while preserving unrelated topics and evidence (English=%s)', async english => {
  const keys = ['grand-theft-auto-vi', 'gta-6', 'gta 6 all the major new details', 'twitch ceo says gta 6 multiplayer will', 'gta-online', 'unreviewed-same-name'];
  const gtaIndex: BriefSearchIndex = { ...index, entries: keys.map((titleKey, i) => ({ ...index.entries[i], editionId: `2026-11-0${i + 1}-daily`, entryId: `original-gta-${i}`, date: `2026-11-0${i + 1}`, titleKey, titleEn: 'Grand Theft Auto VI', titleZhCn: '侠盗猎车手VI', headline: english ? `Original headline ${i}` : `原始标题 ${i}`, summary: english ? `Original summary ${i}` : `原始摘要 ${i}`, factStatus: i === 3 ? 'unconfirmed' : 'media_report', section: i === 3 ? 'rumors' : 'news' })) };
  const before = structuredClone(gtaIndex);
  window.history.replaceState(null, '', '?catchup=1&cuDays=all&cuTopic=gta-6');
  await render({ english, index: gtaIndex });
  expect(document.querySelector('select')?.value).toBe('grand-theft-auto-vi');
  expect(document.querySelector('option[value="gta-6"]')).toBeNull();
  expect(document.querySelectorAll('.cu-story')).toHaveLength(4);
  expect(document.querySelector('.cu-results-heading h2')?.textContent).toBe(english ? 'Grand Theft Auto VI' : '侠盗猎车手VI');
  expect(document.querySelector('.cu-timeline')?.textContent).toContain(english ? 'Rumor / unconfirmed' : '传闻 / 未证实');
  expect(document.querySelector('.cu-timeline')?.textContent).toContain(english ? 'Media report' : '媒体报道');
  expect(document.querySelector('.cu-coverage')?.textContent).toContain(english ? 'Only reviewed topic aliases are grouped' : '仅合并已经核对的主题别名');
  const links = [...document.querySelectorAll<HTMLAnchorElement>('.cu-story-links a')];
  expect(links).toHaveLength(4);
  links.forEach((link, i) => {
    const url = new URL(link.href);
    expect(url.searchParams.get('edition')).toBe(gtaIndex.entries[i].editionId);
    expect(url.hash).toBe(`#${gtaIndex.entries[i].entryId}`);
    expect(url.searchParams.get('lang')).toBe(english ? 'en' : null);
  });
  const copy = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: copy } });
  await click(english ? 'Copy catch-up link' : '复制这份补课');
  expect(new URL(copy.mock.calls[0][0]).searchParams.get('cuTopic')).toBe('grand-theft-auto-vi');
  expect(gtaIndex).toEqual(before);
});
