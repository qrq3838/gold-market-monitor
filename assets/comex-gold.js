(() => {
  "use strict";

  const DATA_URL = "data/comex_gold_futures.json";
  const LINE_COLOR = "#d4a63f";
  const state = { payload: null, startIndex: 0, endIndex: 0, chart: null };
  const els = {
    rangeButtons: document.getElementById("comex-gold-range-buttons"),
    startDate: document.getElementById("comex-gold-start-date"),
    endDate: document.getElementById("comex-gold-end-date"),
    status: document.getElementById("comex-gold-chart-status"),
    latest: document.getElementById("comex-gold-latest"),
    chart: document.getElementById("comex-gold-chart"),
    error: document.getElementById("error-banner")
  };
  const priceFormatter = new Intl.NumberFormat("zh-CN", {
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
    els.status.textContent = `${formatDate(dates[state.startIndex])} 至 ${formatDate(dates[state.endIndex])}，${state.endIndex - state.startIndex + 1} 个有效交易日`;
  }

  function renderChart() {
    const { dates, values } = state.payload;
    state.chart.setOption({
      animationDuration: 350,
      aria: {
        enabled: true,
        description: "COMEX 黄金期货日度收盘价走势曲线，单位为美元每金衡盎司。"
      },
      grid: {
        left: window.innerWidth < 680 ? 58 : 80,
        right: window.innerWidth < 680 ? 20 : 36,
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
          return `<strong>${formatDate(dates[index])}</strong><br><span style="display:inline-block;width:18px;height:3px;border-radius:2px;background:${LINE_COLOR};margin-right:7px;vertical-align:middle"></span>COMEX 收盘：<strong>US$${priceFormatter.format(values[index])}/oz</strong>`;
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
      yAxis: {
        type: "value",
        name: "COMEX 金价（US$/oz）",
        nameTextStyle: { color: "#53656e", align: "left", padding: [0, 0, 8, -62] },
        scale: true,
        splitLine: { lineStyle: { color: "#d9e0e3", type: "dashed" } },
        axisLabel: {
          color: "#53656e",
          formatter: (value) => new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 }).format(value)
        }
      },
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
          fillerColor: "rgba(212,166,63,.27)",
          handleStyle: { color: LINE_COLOR, borderColor: "#8a6518" },
          dataBackground: { lineStyle: { color: "#8a7650" }, areaStyle: { color: "#eadfca" } },
          selectedDataBackground: { lineStyle: { color: LINE_COLOR }, areaStyle: { color: "#d9bd7c" } }
        }
      ],
      series: [{
        name: "COMEX 黄金期货收盘价",
        type: "line",
        data: values,
        symbol: "none",
        showSymbol: false,
        sampling: "lttb",
        lineStyle: { color: LINE_COLOR, width: 2.5 },
        itemStyle: { color: LINE_COLOR },
        areaStyle: { color: LINE_COLOR, opacity: 0.08 }
      }]
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
      if (!window.echarts) throw new Error("COMEX 金价图表组件未能载入，请检查网络连接。");
      const response = await fetch(DATA_URL, { cache: "no-store" });
      if (!response.ok) throw new Error(`COMEX 金价数据文件载入失败（${response.status}）`);
      state.payload = await response.json();
      if (!Array.isArray(state.payload.dates) || state.payload.dates.length !== state.payload.values?.length) {
        throw new Error("COMEX 金价数据格式不完整");
      }
      state.chart = window.echarts.init(els.chart, null, { renderer: "canvas" });
      els.latest.textContent = `${formatDate(state.payload.as_of_date)} · US$${priceFormatter.format(state.payload.values.at(-1))}/oz`;
      bindControls();
      setRange("5");
    } catch (error) {
      console.error(error);
      els.error.hidden = false;
      els.error.textContent = error.message || "COMEX 金价图表载入失败";
      els.status.textContent = "COMEX 金价数据载入失败";
    }
  }

  init();
})();
