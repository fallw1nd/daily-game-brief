import { useEffect, useState } from "react";
import { storedAccent, storedTheme } from "../lib/reading-preferences";
import "./edition-loading.css";

export function EditionLoading({ english = false }: { english?: boolean }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), 10_000);
    return () => window.clearTimeout(timer);
  }, []);
  return <div className="r-edition-loading" role="status" aria-live="polite" aria-atomic="true">
    <div className="r-loader-mark" aria-hidden="true">
      <span className="r-loader-sheet r-loader-sheet--back" />
      <span className="r-loader-sheet r-loader-sheet--middle" />
      <span className="r-loader-sheet r-loader-sheet--front"><i /><i /><i /></span>
    </div>
    <div className="r-loader-copy">
      <span className="r-loader-eyebrow">DAILY GAME BRIEF</span>
      <h1>{english ? "Loading your brief" : "正在读取简报"}</h1>
      <p>{slow ? (english ? "The connection is slow. Still loading…" : "连接较慢，仍在读取…") : (english ? "News, ready to read." : "新闻，即将呈现。")}</p>
    </div>
    <div className="r-loader-track" aria-hidden="true"><span /></div>
  </div>;
}

export function LoadingPage({ english = false }: { english?: boolean }) {
  const [theme] = useState(storedTheme);
  const [accent] = useState(storedAccent);
  return <div className="reading-app r-loading-page" data-theme={theme} data-accent={accent}><main><EditionLoading english={english} /></main></div>;
}
