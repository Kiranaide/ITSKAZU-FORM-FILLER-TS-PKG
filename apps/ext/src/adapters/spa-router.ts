export function watchNavigation(onChange: (url: string) => void): () => void {
  const origPush = history.pushState.bind(history);
  const origReplace = history.replaceState.bind(history);
  let previousUrl = location.href;
  const notify = () => {
    if (location.href !== previousUrl) {
      previousUrl = location.href;
      onChange(location.href);
    }
  };

  history.pushState = (...args) => {
    origPush(...args);
    notify();
  };

  history.replaceState = (...args) => {
    origReplace(...args);
    notify();
  };

  const onPop = () => notify();
  window.addEventListener("popstate", onPop);
  const interval = window.setInterval(notify, 500);

  return () => {
    history.pushState = origPush;
    history.replaceState = origReplace;
    window.removeEventListener("popstate", onPop);
    window.clearInterval(interval);
  };
}
