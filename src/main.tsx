import React from "react";
import { createPortal } from "react-dom";
import ReactDOM from "react-dom/client";
import App from "./App";
import EnglishApp from "./EnglishApp";
import "./styles.css";
import "./locale.css";

function LocaleSwitch({ english }: { english: boolean }) {
  const [target, setTarget] = React.useState<HTMLElement | null>(null);

  React.useEffect(() => {
    const resolveTarget = () => setTarget(document.querySelector<HTMLElement>(".topbar"));
    resolveTarget();
    const observer = new MutationObserver(resolveTarget);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  if (!target) return null;
  const params = new URLSearchParams(window.location.search);
  if (english) params.delete("lang");
  else params.set("lang", "en");
  const query = params.toString();
  const href = import.meta.env.BASE_URL + (query ? `?${query}` : "") + window.location.hash;

  return createPortal(
    <a
      className="locale-toggle theme-toggle interaction-state"
      href={href}
      aria-label={english ? "切换到简体中文" : "Switch to English"}
      title={english ? "简体中文" : "English"}
    >
      <span>{english ? "中文" : "EN"}</span>
    </a>,
    target,
  );
}

const english = new URLSearchParams(window.location.search).get("lang") === "en";
document.documentElement.lang = english ? "en" : "zh-CN";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {english ? <EnglishApp /> : <App />}
    <LocaleSwitch english={english} />
  </React.StrictMode>,
);
