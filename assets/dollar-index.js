(() => {
  "use strict";

  const DATA_URL = "data/us_dollar_index.json";
  const LINE_COLOR = "#697b36";
  const state = {
    payload: null,
    goldValues: [],
    showGoldPrice: true,
    startIndex: 0,
    endIndex: 0,
    chart: null
  };
  const els = {
    rangeButtons: document.getElementById("dollar-index-range-buttons"),
    startDate: document.getElementById("dollar-index-start-date"),
    endDate: document.getElementById("dollar-index-end-date"),
    status: document.getElementById("dollar-index-chart-status"),
    latest: document.getElementById("dollar-index-latest"),
    legend: document.getElementById("dollar-index-series-legend"),
    chart: document.getElementById("dollar-index-chart"),
    error: document.getElementById("error-banner")
  };
  const numberFormatter = new Intl.NumberFormat("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  function formatDate(day) {
    return new Intl.DateTimeFormat("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(new Date(`${day}T00:00:00Z`));
  }

  function formatGoldPrice(value) {
    return `US$${numberFormatter.format(value)}/oz`;
  }

  function renderLegend() {
    els.legend.replaceChildren();
    window.GoldOverlay.appendToggle(els.legend, state.showGoldPrice, () => {
      state.showGoldPrice = !state.showGoldPrice;
      renderLegend();
      renderChart();
    });
  }

  function nearestIndex(day, mode) {
    const dates = state.payload.dates;
    if (mode === "start") {
      const index = dates.findIndex((item) => item >= day);
      return index === -1 ? dates.length - 1 : index;
    }
    for (let index = dates.length - 1; index >= 0; index -= 1) {
      if (dates[index] <= day) return index;
    }
    return 0;
  }

  function updateRangeLabels() {
    const dates = state.payload.dates;
    els.startDate.min = dates[0];
    els.startDate.max = dates.at(-1);
    els.endDate.min = dates[0];
    els.endDate.max = dates.at(-1);
    els.startDate.value = dates[state.startIndex];
    els.endDate.value = dates[state.endIndex];
    els.status.textContent = `${formatDate(dates[state.startIndex])} 至 ${formatDate(dates[state.endIndex])}｜${state.endIndex - state.startIndex + 1} 个有效日度观测`;
  }

  function renderChart() {
    const { dates, values } = state.payload;
    const goldColor = window.GoldOverlay.COLOR;
    const goldSeries = state.showGoldPrice ? [{
      name: window.GoldOverlay.LABEL,
      type: "line",
      yAxisIndex: 1,
      data: state.goldValues,
      symbol: "none",
      showSymbol: false,
      connectNulls: false,
      sampling: "lttb",
      z: 10,
      lineStyle: { color: goldColor, width: 2.6 },
      itemStyle: { color: goldColor },
      emphasis: { focus: "series", lineStyle: { width: 3.6 } }
    }] : [];
    state.chart.setOption({
      animationDuration: 350,
      aria: {
        enabled: true,
        description: "美元指数日度收盘走势曲线，以及可选右轴COMEX黄金期货价格曲线。"
      },
      grid: {
        left: window.innerWidth < 680 ? 50 : 72,
        right: state.showGoldPrice ? (window.innerWidth < 680 ? 58 : 78) : (window.innerWidth < 680 ? 22 : 36),
        top: 42,
        bottom: 92
      },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "line" },
        backgroundColor: "rgba(16, 43, 56, 0.96)",
        borderWidth: 0,
        textStyle: { color: "#fff" },
        formatter(params) {
          const index = params[0]?.dataIndex ?? 0;
          const lines = [
            `<strong>${formatDate(dates[index])}</strong>`,
            `<span style="display:inline-block;width:18px;height:3px;border-radius:2px;background:${LINE_COLOR};margin-right:7px;vertical-align:middle"></span>美元指数收盘：<strong>${numberFormatter.format(values[index])}</strong>`
          ];
          if (state.showGoldPrice && state.goldValues[index] !== null) {
            lines.push(`<span style="display:inline-block;width:18px;height:3px;border-radius:2px;background:${goldColor};margin-right:7px;vertical-align:middle"></span>${window.GoldOverlay.LABEL}：<strong>${formatGoldPrice(state.goldValues[index])}</strong>`);
          }
          return lines.join("<br>");
        }
      },
      xAxis: {
        type: "category",
        data: dates,
        boundaryGap: false,
        axisLine: { lineStyle: { color: "#9ca9af" } },
        axisTick: { show: false },
        axisLabel: {
          color: "#53656e",
          hideOverlap: true,
          margin: 14,
          formatter(day) {
            const value = new Date(`${day}T00:00:00Z`);
            return `${value.getUTCFullYear()}/${String(value.getUTCMonth() + 1).padStart(2, "0")}`;
          }
        }
      },
      yAxis: [
        {
          type: "value",
          name: "美元指数（点）",
          nameTextStyle: { color: "#53656e", align: "left", padding: [0, 0, 8, -54] },
          scale: true,
          splitLine: { lineStyle: { color: "#d9e0e3", type: "dashed" } },
          axisLabel: { color: "#53656e", formatter: (value) => numberFormatter.format(value) }
        },
        {
          type: "value",
          show: state.showGoldPrice,
          min: 0,
          name: "COMEX 金价（US$/oz）",
          nameTextStyle: { color: "#8f6c27", align: "right", padding: [0, -4, 8, 0] },
          axisLine: { show: true, lineStyle: { color: goldColor } },
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
          fillerColor: "rgba(105,123,54,.28)",
          handleStyle: { color: LINE_COLOR, borderColor: "#40501c" },
          dataBackground: { lineStyle: { color: "#63767e" }, areaStyle: { color: "#dfe4d1" } },
          selectedDataBackground: { lineStyle: { color: LINE_COLOR }, areaStyle: { color: "#aab88a" } }
        }
      ],
      series: [{
        name: "美元指数收盘",
        type: "line",
        data: values,
        symbol: "none",
        showSymbol: false,
        sampling: "lttb",
        lineStyle: { color: LINE_COLOR, width: 2.4 },
        itemStyle: { color: LINE_COLOR },
        areaStyle: { color: LINE_COLOR, opacity: 0.08 }
      }, ...goldSeries]
    }, true);
    updateRangeLabels();
  }

  function setRange(years) {
    const dates = state.payload.dates;
    state.endIndex = dates.length - 1;
    if (years === "all") {
      state.startIndex = 0;
    } else {
      const start = new Date(`${dates.at(-1)}T00:00:00Z`);
      start.setUTCFullYear(start.getUTCFullYear() - Number(years));
      state.startIndex = nearestIndex(start.toISOString().slice(0, 10), "start");
    }
    els.rangeButtons.querySelectorAll("button").forEach((button) => {
      button.classList.toggle("active", button.dataset.years === years);
    });
    renderChart();
  }

  function bindControls() {
    els.rangeButtons.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-years]");
      if (button) setRange(button.dataset.years);
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
      const length = state.payload.dates.length;
      state.startIndex = Math.max(0, Math.round((zoom.start / 100) * (length - 1)));
      state.endIndex = Math.min(length - 1, Math.round((zoom.end / 100) * (length - 1)));
      updateRangeLabels();
    });
    window.addEventListener("resize", () => state.chart.resize());
  }

  async function init() {
    try {
      if (!window.echarts) throw new Error("美元指数图表组件未能载入，请检查网络连接。");
      if (!window.GoldOverlay) throw new Error("COMEX 金价叠加组件未能载入");
      const [response, goldPayload] = await Promise.all([
        fetch(DATA_URL, { cache: "no-store" }),
        window.GoldOverlay.load()
      ]);
      if (!response.ok) throw new Error(`美元指数数据文件载入失败（${response.status}）`);
      state.payload = await response.json();
      if (!Array.isArray(state.payload.dates) || state.payload.dates.length !== state.payload.values?.length) {
        throw new Error("美元指数数据格式不完整");
      }
      state.goldValues = window.GoldOverlay.alignToDates(state.payload.dates, goldPayload);
      state.chart = window.echarts.init(els.chart, null, { renderer: "canvas" });
      els.latest.textContent = `${formatDate(state.payload.as_of_date)} · ${numberFormatter.format(state.payload.values.at(-1))}`;
      renderLegend();
      bindControls();
      setRange("5");
    } catch (error) {
      console.error(error);
      els.error.hidden = false;
      els.error.textContent = error.message || "美元指数图表载入失败";
      els.status.textContent = "美元指数数据载入失败";
    }
  }

  init();
})();
