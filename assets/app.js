(() => {
  "use strict";

  const DATA_URL = "data/gold_etf_flows_by_region.json";
  const REGION_LABELS = {
    "North America": "北美",
    "Europe": "欧洲",
    "Asia": "亚洲",
    "Other": "其他"
  };
  const FREQUENCY_LABELS = {
    Yearly: "年度",
    Quarterly: "季度",
    Monthly: "月度",
    Weekly: "周度"
  };
  const GOLD_PRICE_LABEL = "COMEX 金价";

  const state = {
    payload: null,
    goldPriceByFrequency: {},
    unit: "tonnes",
    frequency: "Weekly",
    visibleRegions: new Set(),
    showGoldPrice: true,
    startIndex: 0,
    endIndex: 0,
    chart: null
  };

  const els = {
    headerDate: document.getElementById("header-date"),
    footerDate: document.getElementById("footer-date"),
    periodBadge: document.getElementById("latest-period-badge"),
    globalUsd: document.getElementById("metric-global-usd"),
    globalTonnes: document.getElementById("metric-global-tonnes"),
    inflowRegion: document.getElementById("metric-inflow-region"),
    inflowValue: document.getElementById("metric-inflow-value"),
    outflowRegion: document.getElementById("metric-outflow-region"),
    outflowValue: document.getElementById("metric-outflow-value"),
    unitControls: document.getElementById("unit-controls"),
    frequencyControls: document.getElementById("frequency-controls"),
    rangeButtons: document.getElementById("range-buttons"),
    startDate: document.getElementById("start-date"),
    endDate: document.getElementById("end-date"),
    status: document.getElementById("chart-status"),
    legend: document.getElementById("region-legend"),
    chart: document.getElementById("flow-chart"),
    error: document.getElementById("error-banner")
  };

  const numberFormatter = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 });
  const signedFormatter = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2, signDisplay: "always" });

  function formatDate(date) {
    return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(`${date}T00:00:00Z`));
  }

  function formatAxisDate(date) {
    const d = new Date(`${date}T00:00:00Z`);
    if (state.frequency === "Yearly") return `${d.getUTCFullYear()}`;
    return `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  }

  function formatUsd(value, signed = false) {
    const scaled = value / 1e9;
    return `${signed ? signedFormatter.format(scaled) : numberFormatter.format(scaled)} 十亿美元`;
  }

  function formatTonnes(value, signed = false) {
    return `${signed ? signedFormatter.format(value) : numberFormatter.format(value)} 吨`;
  }

  function formatGoldPrice(value) {
    return `US$${numberFormatter.format(value)}/oz`;
  }

  function setSignedClass(element, value) {
    element.classList.toggle("value-positive", value > 0);
    element.classList.toggle("value-negative", value < 0);
  }

  function currentData() {
    return state.payload.frequencies[state.frequency];
  }

  function setActiveButton(container, attribute, value) {
    container.querySelectorAll("button").forEach((button) => {
      const active = button.dataset[attribute] === value;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }

  function renderMetrics() {
    const data = currentData();
    const lastIndex = data.dates.length - 1;
    const regional = state.payload.regions.map((region) => ({
      name: region.name,
      usd: data.usd[region.name][lastIndex],
      tonnes: data.tonnes[region.name][lastIndex]
    }));
    const globalUsd = regional.reduce((sum, row) => sum + row.usd, 0);
    const globalTonnes = regional.reduce((sum, row) => sum + row.tonnes, 0);
    const inflow = regional.filter((row) => row.usd > 0).sort((a, b) => b.usd - a.usd)[0] || null;
    const outflow = regional.filter((row) => row.usd < 0).sort((a, b) => a.usd - b.usd)[0] || null;
    const latestDate = data.dates[lastIndex];

    els.periodBadge.textContent = `${FREQUENCY_LABELS[state.frequency]} · ${formatDate(latestDate)}`;
    els.globalUsd.textContent = formatUsd(globalUsd, true);
    els.globalTonnes.textContent = formatTonnes(globalTonnes, true);
    els.inflowRegion.textContent = inflow ? REGION_LABELS[inflow.name] : "无净流入";
    els.inflowValue.textContent = inflow ? formatUsd(inflow.usd, true) : "当期全部地区净流出";
    els.outflowRegion.textContent = outflow ? REGION_LABELS[outflow.name] : "无净流出";
    els.outflowValue.textContent = outflow ? formatUsd(outflow.usd, true) : "当期全部地区净流入";
    setSignedClass(els.globalUsd, globalUsd);
    setSignedClass(els.globalTonnes, globalTonnes);
    setSignedClass(els.inflowValue, inflow?.usd ?? 0);
    setSignedClass(els.outflowValue, outflow?.usd ?? 0);
  }

  function renderLegend() {
    els.legend.replaceChildren();
    state.payload.regions.forEach((region) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.region = region.name;
      button.setAttribute("aria-pressed", String(state.visibleRegions.has(region.name)));
      button.setAttribute("aria-label", `${state.visibleRegions.has(region.name) ? "隐藏" : "显示"}${REGION_LABELS[region.name]}`);
      const dot = document.createElement("span");
      dot.className = "legend-dot";
      dot.style.background = region.color;
      const label = document.createElement("span");
      label.textContent = REGION_LABELS[region.name];
      button.append(dot, label);
      button.addEventListener("click", () => {
        if (state.visibleRegions.has(region.name) && state.visibleRegions.size > 1) {
          state.visibleRegions.delete(region.name);
        } else {
          state.visibleRegions.add(region.name);
        }
        renderLegend();
        renderChart();
      });
      els.legend.append(button);
    });

    const priceButton = document.createElement("button");
    priceButton.type = "button";
    priceButton.setAttribute("aria-pressed", String(state.showGoldPrice));
    priceButton.setAttribute("aria-label", `${state.showGoldPrice ? "隐藏" : "显示"}${GOLD_PRICE_LABEL}曲线`);
    const priceLine = document.createElement("span");
    priceLine.className = "legend-line";
    priceLine.style.background = window.GoldOverlay.COLOR;
    const priceLabel = document.createElement("span");
    priceLabel.textContent = GOLD_PRICE_LABEL;
    priceButton.append(priceLine, priceLabel);
    priceButton.addEventListener("click", () => {
      state.showGoldPrice = !state.showGoldPrice;
      renderLegend();
      renderChart();
    });
    els.legend.append(priceButton);
  }

  function updateRangeInputs() {
    const dates = currentData().dates;
    els.startDate.min = dates[0];
    els.startDate.max = dates[dates.length - 1];
    els.endDate.min = dates[0];
    els.endDate.max = dates[dates.length - 1];
    els.startDate.value = dates[state.startIndex];
    els.endDate.value = dates[state.endIndex];
    els.status.textContent = `${formatDate(dates[state.startIndex])} 至 ${formatDate(dates[state.endIndex])}｜${state.endIndex - state.startIndex + 1} 个${FREQUENCY_LABELS[state.frequency]}观测`;
  }

  function nearestIndex(date, mode) {
    const dates = currentData().dates;
    if (mode === "start") {
      const index = dates.findIndex((item) => item >= date);
      return index === -1 ? dates.length - 1 : index;
    }
    for (let i = dates.length - 1; i >= 0; i -= 1) {
      if (dates[i] <= date) return i;
    }
    return 0;
  }

  function renderChart() {
    const data = currentData();
    const scale = state.unit === "usd" ? 1e9 : 1;
    const regions = state.payload.regions.filter((region) => state.visibleRegions.has(region.name));
    const unitTitle = state.unit === "usd" ? "资金流（十亿美元）" : "需求变化（吨）";
    const selectedUnit = data[state.unit];
    const goldPrices = state.goldPriceByFrequency[state.frequency];
    const goldPriceColor = window.GoldOverlay.COLOR;
    const barSeries = regions.map((region) => ({
      name: REGION_LABELS[region.name],
      type: "bar",
      stack: "regional-flow",
      yAxisIndex: 0,
      barMaxWidth: state.frequency === "Weekly" ? 8 : 28,
      itemStyle: { color: region.color },
      emphasis: { focus: "series" },
      data: selectedUnit[region.name].map((value) => value / scale)
    }));
    const priceSeries = state.showGoldPrice ? [{
      name: GOLD_PRICE_LABEL,
      type: "line",
      yAxisIndex: 1,
      data: goldPrices,
      symbol: "none",
      showSymbol: false,
      connectNulls: false,
      smooth: false,
      z: 10,
      lineStyle: { color: goldPriceColor, width: 3 },
      itemStyle: { color: goldPriceColor },
      emphasis: { focus: "series", lineStyle: { width: 4 } }
    }] : [];

    state.chart.setOption({
      animationDuration: 350,
      aria: {
        enabled: true,
        description: `全球黄金ETF${FREQUENCY_LABELS[state.frequency]}${unitTitle}按地区柱状图，以及可选右轴COMEX金价曲线。`
      },
      color: regions.map((region) => region.color),
      grid: { left: window.innerWidth < 680 ? 48 : 72, right: window.innerWidth < 680 ? 56 : 78, top: 42, bottom: 92, containLabel: false },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        backgroundColor: "rgba(16, 43, 56, 0.96)",
        borderWidth: 0,
        textStyle: { color: "#fff" },
        formatter(params) {
          const index = params[0]?.dataIndex ?? 0;
          const rows = regions.map((region) => ({
            region,
            value: selectedUnit[region.name][index]
          }));
          const total = rows.reduce((sum, row) => sum + row.value, 0);
          const goldPrice = goldPrices[index];
          const formatValue = state.unit === "usd" ? (value) => formatUsd(value, true) : (value) => formatTonnes(value, true);
          const lines = [
            `<strong>${formatDate(data.dates[index])}</strong>`,
            ...rows.map((row) => `<span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${row.region.color};margin-right:7px"></span>${REGION_LABELS[row.region.name]}：${formatValue(row.value)}`),
            `<span style="display:inline-block;margin-top:6px;padding-top:6px;border-top:1px solid rgba(255,255,255,.2);width:100%">合计：<strong>${formatValue(total)}</strong></span>`
          ];
          if (state.showGoldPrice && goldPrice !== null) {
            lines.push(`<span style="display:inline-block;width:18px;height:3px;border-radius:2px;background:${goldPriceColor};margin-right:7px;vertical-align:middle"></span>${GOLD_PRICE_LABEL}：<strong>${formatGoldPrice(goldPrice)}</strong>`);
          }
          return lines.join("<br>");
        }
      },
      xAxis: {
        type: "category",
        data: data.dates,
        boundaryGap: true,
        axisLine: { lineStyle: { color: "#9ca9af" } },
        axisTick: { show: false },
        axisLabel: {
          color: "#53656e",
          hideOverlap: true,
          formatter: formatAxisDate,
          margin: 14
        }
      },
      yAxis: [
        {
          type: "value",
          name: unitTitle,
          nameTextStyle: { color: "#53656e", align: "left", padding: [0, 0, 8, -54] },
          splitLine: { lineStyle: { color: "#d9e0e3", type: "dashed" } },
          axisLabel: { color: "#53656e", formatter: (value) => numberFormatter.format(value) }
        },
        {
          type: "value",
          show: state.showGoldPrice,
          min: 0,
          name: "COMEX 金价（US$/oz）",
          nameTextStyle: { color: "#8f6c27", align: "right", padding: [0, -4, 8, 0] },
          axisLine: { show: true, lineStyle: { color: goldPriceColor } },
          axisTick: { show: false },
          splitLine: { show: false },
          axisLabel: { color: "#8f6c27", formatter: (value) => numberFormatter.format(value) }
        }
      ],
      dataZoom: [
        {
          type: "inside",
          startValue: state.startIndex,
          endValue: state.endIndex,
          zoomOnMouseWheel: "shift"
        },
        {
          type: "slider",
          startValue: state.startIndex,
          endValue: state.endIndex,
          height: 30,
          bottom: 24,
          borderColor: "#d9e0e3",
          backgroundColor: "#f0f2f3",
          fillerColor: "rgba(216,171,76,.42)",
          handleStyle: { color: "#d8ab4c", borderColor: "#aa7d26" },
          dataBackground: { lineStyle: { color: "#63767e" }, areaStyle: { color: "#e6d3a5" } },
          selectedDataBackground: { lineStyle: { color: "#31596b" }, areaStyle: { color: "#d8ab4c" } }
        }
      ],
      series: [...barSeries, ...priceSeries]
    }, true);

    updateRangeInputs();
  }

  function setFrequency(frequency) {
    state.frequency = frequency;
    const dates = currentData().dates;
    state.startIndex = 0;
    state.endIndex = dates.length - 1;
    setActiveButton(els.frequencyControls, "frequency", frequency);
    els.rangeButtons.querySelectorAll("button").forEach((button) => button.classList.toggle("active", button.dataset.years === "all"));
    renderMetrics();
    renderChart();
  }

  function setRangeByYears(years) {
    const data = currentData();
    state.endIndex = data.dates.length - 1;
    if (years === "all") {
      state.startIndex = 0;
    } else {
      const end = new Date(`${data.dates[state.endIndex]}T00:00:00Z`);
      end.setUTCFullYear(end.getUTCFullYear() - Number(years));
      state.startIndex = nearestIndex(end.toISOString().slice(0, 10), "start");
    }
    els.rangeButtons.querySelectorAll("button").forEach((button) => button.classList.toggle("active", button.dataset.years === years));
    renderChart();
  }

  function bindControls() {
    els.unitControls.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-unit]");
      if (!button) return;
      state.unit = button.dataset.unit;
      setActiveButton(els.unitControls, "unit", state.unit);
      renderChart();
    });

    els.frequencyControls.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-frequency]");
      if (!button || button.dataset.frequency === state.frequency) return;
      setFrequency(button.dataset.frequency);
    });

    els.rangeButtons.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-years]");
      if (button) setRangeByYears(button.dataset.years);
    });

    els.startDate.addEventListener("change", () => {
      state.startIndex = Math.min(nearestIndex(els.startDate.value, "start"), state.endIndex);
      els.rangeButtons.querySelectorAll("button").forEach((button) => button.classList.remove("active"));
      renderChart();
    });

    els.endDate.addEventListener("change", () => {
      state.endIndex = Math.max(nearestIndex(els.endDate.value, "end"), state.startIndex);
      els.rangeButtons.querySelectorAll("button").forEach((button) => button.classList.remove("active"));
      renderChart();
    });

    state.chart.on("datazoom", () => {
      const option = state.chart.getOption();
      const zoom = option.dataZoom?.[0];
      if (!zoom) return;
      const dates = currentData().dates;
      state.startIndex = Math.max(0, Math.round((zoom.start / 100) * (dates.length - 1)));
      state.endIndex = Math.min(dates.length - 1, Math.round((zoom.end / 100) * (dates.length - 1)));
      updateRangeInputs();
    });

    window.addEventListener("resize", () => state.chart.resize());
  }

  async function init() {
    try {
      if (!window.echarts) throw new Error("图表组件未能载入，请检查网络连接。");
      if (!window.GoldOverlay) throw new Error("COMEX 金价叠加组件未能载入");
      const [response, goldPayload] = await Promise.all([
        fetch(DATA_URL, { cache: "no-store" }),
        window.GoldOverlay.load()
      ]);
      if (!response.ok) throw new Error(`数据文件载入失败（${response.status}）`);
      state.payload = await response.json();
      state.goldPriceByFrequency = Object.fromEntries(
        Object.entries(state.payload.frequencies).map(([frequency, data]) => [
          frequency,
          window.GoldOverlay.alignToDates(data.dates, goldPayload)
        ])
      );
      state.visibleRegions = new Set(state.payload.regions.map((region) => region.name));
      state.chart = window.echarts.init(els.chart, null, { renderer: "canvas" });
      const currentYear = new Date().getFullYear();
      els.headerDate.textContent = state.payload.as_of_date;
      els.footerDate.textContent = `© ${currentYear}`;
      renderLegend();
      bindControls();
      setFrequency("Weekly");
    } catch (error) {
      console.error(error);
      els.error.hidden = false;
      els.error.textContent = error.message || "页面载入失败";
      els.status.textContent = "数据载入失败";
    }
  }

  init();
})();
