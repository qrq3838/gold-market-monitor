(() => {
  "use strict";

  const DATA_URL = "data/central_bank_gold_reserves_by_region.json";
  const state = {
    payload: null,
    includeUs: true,
    visibleRegions: new Set(),
    goldValues: [],
    showGoldPrice: true,
    startIndex: 0,
    endIndex: 0,
    chart: null
  };
  const els = {
    usControls: document.getElementById("central-bank-us-controls"),
    rangeButtons: document.getElementById("central-bank-range-buttons"),
    startDate: document.getElementById("central-bank-start-date"),
    endDate: document.getElementById("central-bank-end-date"),
    status: document.getElementById("central-bank-chart-status"),
    latest: document.getElementById("central-bank-latest"),
    legend: document.getElementById("central-bank-region-legend"),
    chart: document.getElementById("central-bank-chart"),
    error: document.getElementById("error-banner")
  };
  const numberFormatter = new Intl.NumberFormat("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  const integerFormatter = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 });

  function quarterLabel(day) {
    const date = new Date(`${day}T00:00:00Z`);
    return `${date.getUTCFullYear()} 年 Q${Math.floor(date.getUTCMonth() / 3) + 1}`;
  }

  function compactQuarter(day) {
    const date = new Date(`${day}T00:00:00Z`);
    return `${date.getUTCFullYear()} Q${Math.floor(date.getUTCMonth() / 3) + 1}`;
  }

  function tonnes(value) {
    return `${numberFormatter.format(value)} 吨`;
  }

  function currentRegionValues() {
    return state.includeUs ? state.payload.tonnes_including_us : state.payload.tonnes_excluding_us;
  }

  function currentWorldTotals() {
    return state.includeUs
      ? state.payload.world_total_including_us
      : state.payload.world_total_excluding_us;
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

  function updateControls() {
    els.usControls.querySelectorAll("button[data-include-us]").forEach((button) => {
      const active = (button.dataset.includeUs === "true") === state.includeUs;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }

  function renderLegend() {
    els.legend.replaceChildren();
    state.payload.regions.forEach((region) => {
      const button = document.createElement("button");
      button.type = "button";
      const visible = state.visibleRegions.has(region.name);
      button.setAttribute("aria-pressed", String(visible));
      button.setAttribute("aria-label", `${visible ? "隐藏" : "显示"}${region.name}`);
      const swatch = document.createElement("span");
      swatch.className = "legend-dot";
      swatch.style.background = region.color;
      const label = document.createElement("span");
      label.textContent = region.name;
      button.append(swatch, label);
      button.addEventListener("click", () => {
        if (state.visibleRegions.has(region.name)) state.visibleRegions.delete(region.name);
        else state.visibleRegions.add(region.name);
        renderLegend();
        renderChart();
      });
      els.legend.append(button);
    });
    window.GoldOverlay.appendToggle(els.legend, state.showGoldPrice, () => {
      state.showGoldPrice = !state.showGoldPrice;
      renderLegend();
      renderChart();
    });
  }

  function updateRangeLabels() {
    const dates = state.payload.dates;
    els.startDate.min = dates[0];
    els.startDate.max = dates.at(-1);
    els.endDate.min = dates[0];
    els.endDate.max = dates.at(-1);
    els.startDate.value = dates[state.startIndex];
    els.endDate.value = dates[state.endIndex];
    const world = currentWorldTotals()[state.endIndex];
    const usLabel = state.includeUs ? "计入美国" : "不计入美国";
    els.status.textContent = `${quarterLabel(dates[state.startIndex])} 至 ${quarterLabel(dates[state.endIndex])}｜${dates.length} 个季度中的 ${state.endIndex - state.startIndex + 1} 个｜${usLabel}`;
    els.latest.textContent = `${compactQuarter(dates[state.endIndex])} · 全球 ${tonnes(world)}`;
  }

  function renderChart() {
    const { dates, regions } = state.payload;
    const regionValues = currentRegionValues();
    const worldTotals = currentWorldTotals();
    const goldColor = window.GoldOverlay.COLOR;
    const regionSeries = regions
      .filter((region) => state.visibleRegions.has(region.name))
      .map((region) => ({
        name: region.name,
        type: "bar",
        stack: "official-reserves",
        data: regionValues[region.name],
        barMaxWidth: 34,
        itemStyle: { color: region.color },
        emphasis: { focus: "series" }
      }));
    const goldSeries = state.showGoldPrice ? [{
      name: window.GoldOverlay.LABEL,
      type: "line",
      yAxisIndex: 1,
      data: state.goldValues,
      symbol: "none",
      showSymbol: false,
      connectNulls: false,
      z: 20,
      lineStyle: { color: goldColor, width: 2.6 },
      itemStyle: { color: goldColor },
      emphasis: { focus: "series", lineStyle: { width: 3.6 } }
    }] : [];

    state.chart.setOption({
      animationDuration: 350,
      aria: {
        enabled: true,
        description: "全球官方黄金储备按世界黄金协会地区分类的季度堆叠柱状图，并可切换是否计入美国及是否显示右轴COMEX金价。"
      },
      grid: {
        left: window.innerWidth < 680 ? 54 : 82,
        right: state.showGoldPrice ? (window.innerWidth < 680 ? 60 : 82) : (window.innerWidth < 680 ? 22 : 38),
        top: 44,
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
            `<strong>${quarterLabel(dates[index])}</strong>`,
            `全球合计：<strong>${tonnes(worldTotals[index])}</strong>${state.includeUs ? "（计入美国）" : "（不计入美国）"}`
          ];
          if (!state.includeUs && state.payload.united_states_tonnes[index] !== null) {
            lines.push(`本口径扣除美国：<strong>${tonnes(state.payload.united_states_tonnes[index])}</strong>`);
          }
          regions.forEach((region) => {
            if (!state.visibleRegions.has(region.name)) return;
            lines.push(`<span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${region.color};margin-right:7px"></span>${region.name}：<strong>${tonnes(regionValues[region.name][index])}</strong>`);
          });
          if (state.showGoldPrice && state.goldValues[index] !== null) {
            lines.push(`<span style="display:inline-block;width:18px;height:3px;border-radius:2px;background:${goldColor};margin-right:7px;vertical-align:middle"></span>${window.GoldOverlay.LABEL}：<strong>US$${numberFormatter.format(state.goldValues[index])}/oz</strong>`);
          }
          lines.push(`覆盖：当季已报 ${integerFormatter.format(state.payload.reported_countries[index])}｜沿用上期 ${integerFormatter.format(state.payload.carried_forward_countries[index])}｜尚无历史值 ${integerFormatter.format(state.payload.unavailable_countries[index])}`);
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
          formatter: compactQuarter
        }
      },
      yAxis: [
        {
          type: "value",
          min: 0,
          name: "官方黄金储备（吨）",
          nameTextStyle: { color: "#53656e", align: "left", padding: [0, 0, 8, -62] },
          splitLine: { lineStyle: { color: "#d9e0e3", type: "dashed" } },
          axisLabel: { color: "#53656e", formatter: (value) => integerFormatter.format(value) }
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
          axisLabel: { color: "#8f6c27", formatter: (value) => integerFormatter.format(value) }
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
          fillerColor: "rgba(33,87,133,.2)",
          handleStyle: { color: "#215785", borderColor: "#173e60" },
          dataBackground: { lineStyle: { color: "#63767e" }, areaStyle: { color: "#dce3e7" } },
          selectedDataBackground: { lineStyle: { color: "#215785" }, areaStyle: { color: "#9fb8cb" } }
        }
      ],
      series: [...regionSeries, ...goldSeries]
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
    els.rangeButtons.querySelectorAll("button[data-years]").forEach((button) => {
      button.classList.toggle("active", button.dataset.years === years);
    });
    renderChart();
  }

  function bindControls() {
    els.usControls.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-include-us]");
      if (!button) return;
      state.includeUs = button.dataset.includeUs === "true";
      updateControls();
      renderChart();
    });
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
      if (!window.echarts) throw new Error("央行储备图表组件未能载入，请检查网络连接。");
      if (!window.GoldOverlay) throw new Error("COMEX 金价叠加组件未能载入");
      const [response, goldPayload] = await Promise.all([
        fetch(DATA_URL, { cache: "no-store" }),
        window.GoldOverlay.load()
      ]);
      if (!response.ok) throw new Error(`央行储备数据文件载入失败（${response.status}）`);
      state.payload = await response.json();
      if (!Array.isArray(state.payload.dates)
        || state.payload.dates.length < 100
        || !Array.isArray(state.payload.regions)
        || state.payload.regions.length !== state.payload.region_count
        || state.payload.world_total_including_us.length !== state.payload.dates.length
        || state.payload.world_total_excluding_us.length !== state.payload.dates.length) {
        throw new Error("央行储备数据格式不完整");
      }
      state.payload.regions.forEach((region) => {
        if (state.payload.tonnes_including_us[region.name]?.length !== state.payload.dates.length
          || state.payload.tonnes_excluding_us[region.name]?.length !== state.payload.dates.length) {
          throw new Error(`央行储备地区序列不完整：${region.name}`);
        }
      });
      state.visibleRegions = new Set(state.payload.regions.map((region) => region.name));
      state.goldValues = window.GoldOverlay.alignToDates(state.payload.dates, goldPayload);
      state.chart = window.echarts.init(els.chart, null, { renderer: "canvas" });
      updateControls();
      renderLegend();
      bindControls();
      setRange("all");
    } catch (error) {
      console.error(error);
      els.error.hidden = false;
      els.error.textContent = error.message || "央行储备图表载入失败";
      els.status.textContent = "央行储备数据载入失败";
    }
  }

  init();
})();
