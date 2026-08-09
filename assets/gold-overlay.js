(() => {
  "use strict";

  const DATA_URL = "data/comex_gold_futures.json";
  const COLOR = "#d4a63f";
  const LABEL = "COMEX 金价";
  let payloadPromise = null;

  function validate(payload) {
    if (!Array.isArray(payload?.dates) || payload.dates.length !== payload.values?.length) {
      throw new Error("COMEX 金价数据格式不完整");
    }
    if (payload.symbol !== "GC=F" || payload.dates.length < 6000) {
      throw new Error("COMEX 金价数据来源或历史长度异常");
    }
    return payload;
  }

  function load() {
    if (!payloadPromise) {
      payloadPromise = fetch(DATA_URL, { cache: "no-store" }).then((response) => {
        if (!response.ok) throw new Error(`COMEX 金价数据文件载入失败（${response.status}）`);
        return response.json();
      }).then(validate);
    }
    return payloadPromise;
  }

  function alignToDates(targetDates, payload) {
    validate(payload);
    const aligned = [];
    let goldIndex = 0;
    let latestValue = null;
    for (const targetDate of targetDates) {
      while (goldIndex < payload.dates.length && payload.dates[goldIndex] <= targetDate) {
        latestValue = payload.values[goldIndex];
        goldIndex += 1;
      }
      aligned.push(latestValue);
    }
    return aligned;
  }

  function appendToggle(container, visible, onClick) {
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("aria-pressed", String(visible));
    button.setAttribute("aria-label", `${visible ? "隐藏" : "显示"}${LABEL}曲线`);
    const line = document.createElement("span");
    line.className = "legend-line";
    line.style.background = COLOR;
    const label = document.createElement("span");
    label.textContent = LABEL;
    button.append(line, label);
    button.addEventListener("click", onClick);
    container.append(button);
    return button;
  }

  window.GoldOverlay = Object.freeze({ DATA_URL, COLOR, LABEL, load, alignToDates, appendToggle });
})();
