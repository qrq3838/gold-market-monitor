(() => {
  "use strict";

  const DATA_URL = "data/gold_etf_holdings_by_region.json";
  const REGION_LABELS = {
    "North America": "北美",
    Europe: "欧洲",
    Asia: "亚洲",
    Other: "其他"
  };
  const FREQUENCY_LABELS = {
    Yearly: "年度",
    Quarterly: "季度",
    Monthly: "月度",
    Weekly: "周度"
  };
  const STACK_ORDER = ["Other", "Asia", "Europe", "North America"];
  const GOLD_PRICE_LABEL = "金价";

  const state = {
    payload: null,
    unit: "tonnes",
    frequency: "Weekly",
    visibleRegions: new Set(),
    showGoldPrice: true,
    startIndex: 0,
    endIndex: 0,
    chart: null
  };

  const els = {
    unitControls: document.getElementById("holdings-unit-controls"),
    frequencyControls: document.getElementById("holdings-frequency-controls"),
    rangeButtons: document.getElementById("holdings-range-buttons"),
    startDate: document.getElementById("holdings-start-date"),
    endDate: document.getElementById("holdings-end-date"),
    status: document.getElementById("holdings-chart-status"),
    legend: document.getElementById("holdings-region-legend"),
    chart: document.getElementById("holdings-chart"),
    error: document.getElementById("error-banner")
  };

  const numberFormatter = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 });

  function currentData() {
    return state.payload.frequencies[state.frequency];
  }

  function formatDate(date) {
    return new Intl.DateTimeFormat("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(new Date(`${date}T00:00:00Z`));
  }

  function formatAxisDate(date) {
    const value = new Date(`${date}T00:00:00Z`);
    if (state.frequency === "Yearly") return `${value.getUTCFullYear()}`;
    if (state.frequency === "Quarterly") {
      return `${value.getUTCFullYear()} Q${Math.floor(value.getUTCMonth() / 3) + 1}`;
    }
    return `${value.getUTCFullYear()}/${String(value.getUTCMonth() + 1).padStart(2, "0")}`;
  }

  function formatHolding(value) {
    if (value === null || Number.isNaN(value)) return "—";
    return state.unit === "usd"
      ? `US$${numberFormatter.format(value / 1e9)}bn`
      : `${numberFormatter.format(value)} 吨`;
  }

  function formatGoldPrice(value) {
    return `US$${numberFormatter.format(value)}/oz`;
  }

  function setActiveButton(container, attribute, value) {
    container.querySelectorAll("button").forEach((button) => {
      const active = button.dataset[attribute] === value;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }

  function updateRangeInputs() {
    const dates = currentData().dates;
    els.startDate.min = dates[0];
    els.startDate.max = dates.at(-1);
    els.endDate.min = dates[0];
    els.endDate.max = dates.at(-1);
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
    for (let index = dates.length - 1; index >= 0; index -= 1) {
      if (dates[index] <= date) return index;
    }
    return 0;
  }

  function renderLegend() {
    els.legend.replaceChildren();
    state.payload.regions.forEach((region) => {
      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("aria-pressed", String(state.visibleRegions.has(region.name)));
      button.setAttribute(
        "aria-label",
        `${state.visibleRegions.has(region.name) ? "隐藏" : "显示"}${REGION_LABELS[region.name]}`
      );
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
    priceButton.setAttribute("aria-label", `${state.showGoldPrice ? "隐藏" : "显示"}金价曲线`);
    const line = document.createElement("span");
    line.className = "legend-line";
    line.style.background = state.payload.gold_price.color;
    const label = document.createElement("span");
    label.textContent = GOLD_PRICE_LABEL;
    priceButton.append(line, label);
    priceButton.addEventListener("click", () => {
      state.showGoldPrice = !state.showGoldPrice;
      renderLegend();
      renderChart();
    });
    els.legend.append(priceButton);
  }

  function renderChart() {
    const data = currentData();
    const selectedUnit = data[state.unit];
    const scale = state.unit === "usd" ? 1e9 : 1;
    const unitTitle = state.unit === "usd" ? "管理资产规模（US$bn）" : "持仓（吨）";
    const goldPriceColor = state.payload.gold_price.color;
    const visibleRegions = STACK_ORDER
      .filter((name) => state.visibleRegions.has(name))
      .map((name) => state.payload.regions.find((region) => region.name === name));

    const areaSeries = visibleRegions.map((region) => ({
      name: REGION_LABELS[region.name],
      type: "line",
      stack: "regional-holdings",
      yAxisIndex: 0,
      symbol: "none",
      showSymbol: false,
      connectNulls: false,
      sampling: state.frequency === "Weekly" ? "lttb" : undefined,
      lineStyle: { color: region.color, width: 1.2 },
      areaStyle: { color: region.color, opacity: 0.92 },
      itemStyle: { color: region.color },
      emphasis: { focus: "series" },
      data: selectedUnit[region.name].map((value) => (value === null ? null : value / scale))
    }));

    const priceSeries = state.showGoldPrice
      ? [{
          name: GOLD_PRICE_LABEL,
          type: "line",
          yAxisIndex: 1,
          data: data.gold_price_usd_per_oz,
          symbol: "none",
          showSymbol: false,
          z: 10,
          lineStyle: { color: goldPriceColor, width: 3 },
          itemStyle: { color: goldPriceColor },
          emphasis: { focus: "series", lineStyle: { width: 4 } }
        }]
      : [];

    state.chart.setOption({
      animationDuration: 350,
      aria: {
        enabled: true,
        description: `全球黄金 ETF ${FREQUENCY_LABELS[state.frequency]}${unitTitle}按地区堆叠面积图，以及右轴金价曲线。`
      },
      grid: {
        left: window.innerWidth < 680 ? 48 : 72,
        right: window.innerWidth < 680 ? 56 : 78,
        top: 42,
        bottom: 92,
        containLabel: false
      },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "line" },
        backgroundColor: "rgba(16, 43, 56, 0.96)",
        borderWidth: 0,
        textStyle: { color: "#fff" },
        formatter(params) {
          const index = params[0]?.dataIndex ?? 0;
          const rows = state.payload.regions
            .filter((region) => state.visibleRegions.has(region.name))
            .map((region) => ({ region, value: selectedUnit[region.name][index] }));
          const total = rows.reduce((sum, row) => sum + (row.value ?? 0), 0);
          return [
            `<strong>${formatDate(data.dates[index])}</strong>`,
            ...rows.map((row) => `<span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${row.region.color};margin-right:7px"></span>${REGION_LABELS[row.region.name]}：${formatHolding(row.value)}`),
            `<span style="display:inline-block;margin-top:6px;padding-top:6px;border-top:1px solid rgba(255,255,255,.2);width:100%">合计：<strong>${formatHolding(total)}</strong></span>`,
            `<span style="display:inline-block;width:18px;height:3px;border-radius:2px;background:${goldPriceColor};margin-right:7px;vertical-align:middle"></span>金价：<strong>${formatGoldPrice(data.gold_price_usd_per_oz[index])}</strong>`
          ].join("<br>");
        }
      },
      xAxis: {
        type: "category",
        data: data.dates,
        boundaryGap: false,
        axisLine: { lineStyle: { color: "#9ca9af" } },
        axisTick: { show: false },
        axisLabel: { color: "#53656e", hideOverlap: true, formatter: formatAxisDate, margin: 14 }
      },
      yAxis: [
        {
          type: "value",
          min: 0,
          name: unitTitle,
          nameTextStyle: { color: "#53656e", align: "left", padding: [0, 0, 8, -54] },
          splitLine: { lineStyle: { color: "#d9e0e3", type: "dashed" } },
          axisLabel: { color: "#53656e", formatter: (value) => numberFormatter.format(value) }
        },
        {
          type: "value",
          show: state.showGoldPrice,
          min: 0,
          name: "金价（US$/oz）",
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
      series: [...areaSeries, ...priceSeries]
    }, true);

    updateRangeInputs();
  }

  function setFrequency(frequency) {
    state.frequency = frequency;
    const dates = currentData().dates;
    state.startIndex = 0;
    state.endIndex = dates.length - 1;
    setActiveButton(els.frequencyControls, "frequency", frequency);
    els.rangeButtons.querySelectorAll("button").forEach((button) => {
      button.classList.toggle("active", button.dataset.years === "all");
    });
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
    els.rangeButtons.querySelectorAll("button").forEach((button) => {
      button.classList.toggle("active", button.dataset.years === years);
    });
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
      const zoom = state.chart.getOption().dataZoom?.[0];
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
      if (!window.echarts) throw new Error("持仓图表组件未能载入，请检查网络连接。");
      const response = await fetch(DATA_URL, { cache: "no-store" });
      if (!response.ok) throw new Error(`持仓数据文件载入失败（${response.status}）`);
      state.payload = await response.json();
      state.visibleRegions = new Set(state.payload.regions.map((region) => region.name));
      state.chart = window.echarts.init(els.chart, null, { renderer: "canvas" });
      renderLegend();
      bindControls();
      setFrequency("Weekly");
    } catch (error) {
      console.error(error);
      els.error.hidden = false;
      els.error.textContent = error.message || "持仓图表载入失败";
      els.status.textContent = "持仓数据载入失败";
    }
  }

  init();
})();
