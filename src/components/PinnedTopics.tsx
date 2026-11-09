import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { PushPin, X } from "@phosphor-icons/react";
import type { CatchupTopic } from "../lib/catchup";
import { pinnedTopicsKey, pinnedTopicsLimit, readPinnedTopics } from "../lib/pinned-topics";

export function PinnedTopics({ topics, counts, selected, activeTopic, english, onChoose }: {
  topics: CatchupTopic[];
  counts: Map<string, number>;
  selected?: CatchupTopic;
  activeTopic: string;
  english: boolean;
  onChoose: (key: string) => void;
}) {
  const t = (zh: string, en: string) => english ? en : zh;
  const [saved, setSaved] = useState(readPinnedTopics);
  const section = useRef<HTMLElement>(null);
  const removedFocusIndex = useRef<number | undefined>(undefined);
  useLayoutEffect(() => {
    const index = removedFocusIndex.current;
    if (index === undefined) return;
    removedFocusIndex.current = undefined;
    const buttons = section.current?.querySelectorAll<HTMLButtonElement>(".cu-pin-topic");
    const target = buttons?.[Math.min(index, buttons.length - 1)]
      ?? section.current?.querySelector<HTMLElement>("#cu-pins-title");
    target?.focus({ preventScroll: true });
  }, [saved.keys]);
  useEffect(() => {
    function sync(event: StorageEvent) {
      try {
        if (event.storageArea === localStorage && (event.key === pinnedTopicsKey || event.key === null)) setSaved(readPinnedTopics());
      } catch { /* In-memory pins still work when storage is blocked. */ }
    }
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  function changePin(key: string, remove: boolean) {
    // Merge an explicit action with the newest tab's value. Never write on mount or sync.
    const latest = readPinnedTopics();
    const previous = saved.persistent && latest.persistent ? latest.keys : saved.keys;
    const keys = remove ? previous.filter(item => item !== key) : [...new Set([...previous, key])].slice(0, pinnedTopicsLimit);
    try { localStorage.setItem(pinnedTopicsKey, JSON.stringify(keys)); setSaved({ keys, persistent: true }); }
    catch { setSaved({ keys, persistent: false }); }
  }
  const pinned = Boolean(selected && saved.keys.includes(selected.key));
  return <section ref={section} className="cu-pins" aria-labelledby="cu-pins-title">
    <div className="cu-pins-heading"><h2 id="cu-pins-title" tabIndex={-1}><PushPin aria-hidden="true" />{t("常看主题", "Pinned topics")}<span>{saved.keys.length}/{pinnedTopicsLimit}</span></h2>
      {selected && <button className="cu-text-button" aria-pressed={pinned} disabled={!pinned && saved.keys.length >= pinnedTopicsLimit} onClick={() => changePin(selected.key, pinned)}>{pinned ? t("取消常看", "Unpin this topic") : t("设为常看主题", "Pin this topic")}</button>}
    </div>
    <p>{t("仅保存在当前浏览器，不同步、不发送通知。点击主题沿用当前日期范围；数字为期间收录条数。", "Saved only in this browser, without sync or notifications. Topics use your current dates; counts show indexed stories in that window.")}</p>
    {!saved.persistent && <p className="cu-pins-warning" role="status">{t("浏览器存储不可用，常看主题仅在本页临时保留，刷新后可能丢失。", "Browser storage is unavailable. Pins are temporary on this page and may be lost on reload.")}</p>}
    {!saved.keys.length ? <p>{t("先选择一个主题，再将它设为常看。", "Choose a topic above, then pin it here.")}</p> : <ul>{saved.keys.map(key => {
      const topic = topics.find(item => item.key === key);
      const label = topic?.label ?? t(`当前语言未收录：${key}`, `Not indexed in this language: ${key}`);
      return <li key={key}><button className="cu-pin-topic" aria-pressed={activeTopic === key} onClick={() => onChoose(key)}><span>{label}</span><span className="cu-pin-count">{counts.get(key) ?? 0}</span></button><button className="cu-pin-remove" aria-label={t(`移除常看主题：${label}`, `Unpin topic: ${label}`)} onClick={() => { removedFocusIndex.current = saved.keys.indexOf(key); changePin(key, true); }}><X aria-hidden="true" /></button></li>;
    })}</ul>}
    {saved.keys.length >= pinnedTopicsLimit && <p>{t("最多保留12个常看主题；移除一个后可继续添加。", "Keep up to 12 pinned topics. Remove one to add another.")}</p>}
  </section>;
}
