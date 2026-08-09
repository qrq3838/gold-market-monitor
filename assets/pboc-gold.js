(() => {
  "use strict";

  const DATA_URL = "data/pboc_gold_reserve_changes.json";
  const BAR_COLOR = "#b68a2e";
  const ZERO_COLOR = "#c7ced1";
  const state = {
    payload: null,
    goldValues: [],
    showGoldPrice: true,
    startIndex: 0,
    endIndex: 0,
    chart: null
  };
  const els = {
    rangeButtons: document.getElementById("pboc-gold-range-buttons"),
    startDate: document.getElementById("pboc-gold-start-date"),
    endDate: document.getElementById("pboc-gold-end-date"),
    status: document.getElementById("pboc-gold-chart-status"),
    latest: document.getElementById("pboc-gold-latest"),
    legend: document.getElementById("pboc-gold-series-legend"),
    chart: document.getElementById("pboc-gold-chart"),
    error: document.getElementById("error-banner")
  };
  const numberFormatter = new Intl.NumberFormat("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  function formatMonth(day) {
    const value = new Date(`${day}T00:00:00Z`);
    return `${value.getUTCFullYear()} 年 ${value.getUTCMonth() + 1} 月`;
  }

  function signedTonnes(value) {
    if (value === null) return "基准月";
    return `${value > 0 ? "+" : ""}${numberFormatter.format(value)} 吨`;
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
    const validChanges = state.payload.monthly_change_tonnes
      .slice(state.startIndex, state.endIndex + 1)
      .filter((value) => value !== null).length;
    els.status.textContent = `${formatMonth(dates[state.startIndex])} 至 ${formatMonth(dates[state.endIndex])}｜${validChanges} 个月度增持观测`;
  }

  function renderChart() {
    const { dates, reserve_10k_oz: reserves, monthly_change_10k_oz: ounceChanges, monthly_change_tonnes: changes } = state.payload;
    const goldColor = window.GoldOverlay.COLOR;
    const barData = changes.map((value) => ({
      value,
      itemStyle: value === 0
        ? { color: ZERO_COLOR, borderColor: "#aeb8bc", borderWidth: 1 }
        : value < 0
          ? { color: "#f2e8d1", borderColor: "#8c6820", borderWidth: 1.2 }
          : { color: BAR_COLOR, borderColor: "#8c6820", borderWidth: 0.6 }
    }));
    const goldSeries = state.showGoldPrice ? [{
      name: window.GoldOverlay.LABEL,
      type: "line",
      yAxisIndex: 1,
      data: state.goldValues,
      symbol: "none",
      showSymbol: false,
      connectNulls: false,
      z: 10,
      lineStyle: { color: goldColor, width: 2.6 },
      itemStyle: { color: goldColor },
      emphasis: { focus: "series", lineStyle: { width: 3.6 } }
    }] : [];
    state.chart.setOption({
      animationDuration: 350,
      aria: {
        enabled: true,
        description: "中国人民银行月度黄金储备增持吨数柱状图，以及可选右轴COMEX黄金期货价格曲线。"
      },
      grid: {
        left: window.innerWidth < 680 ? 52 : 74,
        right: state.showGoldPrice ? (window.innerWidth < 680 ? 58 : 78) : (window.innerWidth < 680 ? 22 : 36),
        top: 42,
        bottom: 92
      },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        backgroundColor: "rgba(16, 43, 56, 0.96)",
        borderWidth: 0,
        textStyle: { color: "#fff" },
        formatter(params) {
          const index = params[0]?.dataIndex ?? 0;
          const lines = [
            `<strong>${formatMonth(dates[index])}</strong>`,
            `月度增持：<strong>${signedTonnes(changes[index])}</strong>`,
            `实物变化：<strong>${ounceChanges[index] === null ? "—" : `${ounceChanges[index] > 0 ? "+" : ""}${ounceChanges[index]} 万盎司`}</strong>`,
            `期末储备：<strong>${reserves[index].toLocaleString("zh-CN")} 万盎司</strong>`
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
        boundaryGap: true,
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
          min: (range) => Math.min(0, range.min),
          name: "月度增持（吨）",
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
          fillerColor: "rgba(182,138,46,.28)",
          handleStyle: { color: BAR_COLOR, borderColor: "#795817" },
          dataBackground: { lineStyle: { color: "#63767e" }, areaStyle: { color: "#e7dfcf" } },
          selectedDataBackground: { lineStyle: { color: BAR_COLOR }, areaStyle: { color: "#cdb77f" } }
        }
      ],
      series: [{
        name: "月度黄金储备增持",
        type: "bar",
        data: barData,
        barMaxWidth: 22,
        itemStyle: { borderRadius: [2, 2, 0, 0] },
        emphasis: { focus: "series" }
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
      if (!window.echarts) throw new Error("央行购金图表组件未能载入，请检查网络连接。");
      if (!window.GoldOverlay) throw new Error("COMEX 金价叠加组件未能载入");
      const [response, goldPayload] = await Promise.all([
        fetch(DATA_URL, { cache: "no-store" }),
        window.GoldOverlay.load()
      ]);
      if (!response.ok) throw new Error(`央行购金数据文件载入失败（${response.status}）`);
      state.payload = await response.json();
      const arrays = [
        state.payload.reserve_10k_oz,
        state.payload.reserve_tonnes,
        state.payload.monthly_change_10k_oz,
        state.payload.monthly_change_tonnes
      ];
      if (!Array.isArray(state.payload.dates)
        || state.payload.dates.length < 120
        || arrays.some((values) => !Array.isArray(values) || values.length !== state.payload.dates.length)) {
        throw new Error("央行购金数据格式不完整");
      }
      state.goldValues = window.GoldOverlay.alignToDates(state.payload.dates, goldPayload);
      state.chart = window.echarts.init(els.chart, null, { renderer: "canvas" });
      els.latest.textContent = `${formatMonth(state.payload.as_of_date)} · ${signedTonnes(state.payload.monthly_change_tonnes.at(-1))}`;
      renderLegend();
      bindControls();
      setRange("all");
    } catch (error) {
      console.error(error);
      els.error.hidden = false;
      els.error.textContent = error.message || "央行购金图表载入失败";
      els.status.textContent = "央行购金数据载入失败";
    }
  }

  init();
})();
