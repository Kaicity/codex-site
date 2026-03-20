const width = 850;
const height = 400;

// ===== STATE =====
let selectedDefaultAttrs = ["MPG", "Horsepower"]; // State ban dau
let target = "Manufacturer";

const color = d3.scaleOrdinal(d3.schemeTableau10);

d3.csv("a1-cars.csv").then((data) => {
  data.forEach((d) => {
    d.MPG = +d.MPG;
    d.Weight = +d.Weight / 100;
    d.Horsepower = +d.Horsepower;
    d.Acceleration = +d.Acceleration;
    d["Model Year"] = +d["Model Year"];
  });

  color.domain([...new Set(data.map((d) => d[target]))]);

  createLegend();
  updateUI();
  renderAll();

  // ===== CONTROL =====
  d3.selectAll(".attr-item").on("click", function () {
    const val = d3.select(this).attr("data-value");

    if (selectedDefaultAttrs.includes(val)) {
      // remove
      selectedDefaultAttrs = selectedDefaultAttrs.filter((d) => d !== val);
    } else {
      // add (giữ thứ tự)
      selectedDefaultAttrs.push(val);
    }

    updateUI();
    renderAll();
  });

  d3.selectAll(".panel input[type='checkbox']").on("change", function () {
    const val = this.value;
    if (this.checked) {
      if (!selectedDefaultAttrs.includes(val)) selectedDefaultAttrs.push(val);
    } else {
      selectedDefaultAttrs = selectedDefaultAttrs.filter((d) => d !== val);
    }
    renderAll();
  });

  d3.selectAll("input[name='target']").on("change", function () {
    target = this.value;
    renderAll();
  });

  function updateUI() {
    d3.selectAll(".attr-item").each(function () {
      const val = d3.select(this).attr("data-value");
      const index = selectedDefaultAttrs.indexOf(val);

      if (index !== -1) {
        d3.select(this)
          .classed("active", true)
          .select(".order")
          .text(index + 1); // số thứ tự
      } else {
        d3.select(this).classed("active", false).select(".order").text("");
      }
    });
  }

  function renderAll() {
    d3.selectAll("svg").remove();
    renderScatter();
    renderBar();
    renderParallel();
    renderPie();
  }

  // ================= SCATTER =================
  function renderScatter() {
    if (selectedDefaultAttrs.length < 2) return;

    const xAttr = selectedDefaultAttrs[1];
    const yAttr = selectedDefaultAttrs[0];

    const margin = { top: 20, right: 20, bottom: 40, left: 50 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const svg = d3
      .select("#scatterChart")
      .append("svg")
      .attr("viewBox", `0 0 ${width} ${height}`);

    // ===== CLIP PATH =====
    svg
      .append("defs")
      .append("clipPath")
      .attr("id", "clip")
      .append("rect")
      .attr("x", margin.left)
      .attr("y", margin.top)
      .attr("width", innerWidth)
      .attr("height", innerHeight);

    const x = d3
      .scaleLinear()
      .domain(d3.extent(data, (d) => d[xAttr]))
      .nice()
      .range([margin.left, margin.left + innerWidth]);

    const y = d3
      .scaleLinear()
      .domain(d3.extent(data, (d) => d[yAttr]))
      .nice()
      .range([margin.top + innerHeight, margin.top]);

    // ===== AXIS =====
    const gx = svg
      .append("g")
      .attr("transform", `translate(0, ${margin.top + innerHeight})`)
      .call(d3.axisBottom(x));

    const gy = svg
      .append("g")
      .attr("transform", `translate(${margin.left}, 0)`)
      .call(d3.axisLeft(y));

    // ===== GROUP (CLIPPED) =====
    const g = svg.append("g").attr("clip-path", "url(#clip)");

    const circles = g
      .selectAll("circle")
      .data(data)
      .enter()
      .append("circle")
      .attr("class", "scatter-point")
      .attr("cx", (d) => x(d[xAttr]))
      .attr("cy", (d) => y(d[yAttr]))
      .attr("r", 5)
      .attr("fill", (d) => color(d[target]))
      .attr("opacity", 0.7)
      .on("mouseover", (e, d) => highlightAll(d[target]))
      .on("mouseout", resetHighlight);

    // ===== LABEL =====
    svg
      .append("text")
      .attr("x", width / 2)
      .attr("y", height - 8)
      .attr("text-anchor", "middle")
      .text(xAttr);

    svg
      .append("text")
      .attr("transform", "rotate(-90)")
      .attr("x", -height / 2)
      .attr("y", 18)
      .attr("text-anchor", "middle")
      .text(yAttr);

    // ===== ZOOM =====
    const zoom = d3
      .zoom()
      .scaleExtent([1, 9])
      .translateExtent([
        [0, 0],
        [width, height],
      ])
      .on("zoom", (event) => {
        const zx = event.transform.rescaleX(x);
        const zy = event.transform.rescaleY(y);

        circles.attr("cx", (d) => zx(d[xAttr])).attr("cy", (d) => zy(d[yAttr]));

        gx.call(d3.axisBottom(zx));
        gy.call(d3.axisLeft(zy));
      });

    svg.call(zoom);

    const wrapper = d3.select("#scatterWrapper");

    wrapper
      .select(".zoom-in")
      .on("click", null)
      .on("click", () => {
        svg.transition().call(zoom.scaleBy, 1.2);
      });

    wrapper
      .select(".zoom-out")
      .on("click", null)
      .on("click", () => {
        svg.transition().call(zoom.scaleBy, 0.8);
      });
  }

  // ================= BAR =================
  function renderBar() {
    const attrs = selectedDefaultAttrs.length ? selectedDefaultAttrs : ["MPG"];

    const grouped = d3.rollups(
      data,
      (v) => {
        const obj = {};
        attrs.forEach((a) => {
          obj[a] = d3.mean(v, (d) => d[a]);
        });
        return obj;
      },
      (d) => d[target],
    );

    const formatted = grouped.map(([k, v]) => ({
      group: k,
      ...v,
    }));

    // ===== SVG =====
    const svg = d3
      .select("#barChart")
      .append("svg")
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("width", "100%")
      .attr("height", "100%");

    // 👉 Layer để zoom
    const zoomLayer = svg.append("g");

    // ===== SCALE =====
    const x0 = d3
      .scaleBand()
      .domain(formatted.map((d) => d.group))
      .range([60, 750])
      .padding(0.2);

    const x1 = d3
      .scaleBand()
      .domain(attrs)
      .range([0, x0.bandwidth()])
      .padding(0.05);

    const y = d3
      .scaleLinear()
      .domain([0, d3.max(formatted, (d) => d3.max(attrs, (k) => d[k]))])
      .nice()
      .range([300, 20]);

    const colorAttr = d3.scaleOrdinal().domain(attrs).range(d3.schemeTableau10);

    // ===== DRAW BAR =====
    zoomLayer
      .append("g")
      .selectAll("g")
      .data(formatted)
      .enter()
      .append("g")
      .attr("transform", (d) => `translate(${x0(d.group)},0)`)
      .selectAll("rect")
      .data((d) =>
        attrs.map((k) => ({
          key: k,
          value: d[k],
          group: d.group,
        })),
      )
      .enter()
      .append("rect")
      .attr("class", "bar-rect")
      .attr("x", (d) => x1(d.key))
      .attr("y", (d) => y(d.value))
      .attr("width", x1.bandwidth())
      .attr("height", (d) => 300 - y(d.value))
      .attr("fill", (d) => colorAttr(d.key))
      .on("mouseover", (e, d) => {
        highlightAll(d.group);
      })
      .on("mouseout", resetHighlight);

    // ===== AXIS X =====
    const gx = zoomLayer
      .append("g")
      .attr("transform", "translate(0,300)")
      .call(d3.axisBottom(x0));

    gx.selectAll("text")
      .attr("transform", "rotate(-30)")
      .style("text-anchor", "end");

    // ===== AXIS Y =====
    const gy = zoomLayer
      .append("g")
      .attr("transform", "translate(60,0)")
      .call(d3.axisLeft(y));

    // ===== LABEL X =====
    zoomLayer
      .append("text")
      .attr("x", 400)
      .attr("y", 360)
      .attr("text-anchor", "middle")
      .text(target);

    // ===== LABEL Y =====
    zoomLayer
      .append("text")
      .attr("transform", "rotate(-90)")
      .attr("x", -175)
      .attr("y", 20)
      .attr("text-anchor", "middle")
      .text("Average Value");

    // ===== LEGEND =====
    const legend = zoomLayer.append("g").attr("transform", "translate(745,30)");

    attrs.forEach((attr, i) => {
      const g = legend.append("g").attr("transform", `translate(0,${i * 20})`);

      g.append("rect")
        .attr("width", 10)
        .attr("height", 10)
        .attr("fill", colorAttr(attr));

      g.append("text").attr("x", 15).attr("y", 10).text(attr);
    });

    // ===== ZOOM =====
    const zoom = d3
      .zoom()
      .scaleExtent([0.5, 5])
      .translateExtent([
        [0, 0],
        [width, height],
      ])
      .on("zoom", (event) => {
        zoomLayer.attr("transform", event.transform);
      });

    svg.call(zoom);

    // ===== BUTTON ZOOM =====
    const wrapper = d3.select("#barWrapper");

    wrapper
      .select(".zoom-in")
      .on("click", null)
      .on("click", () => {
        svg.transition().call(zoom.scaleBy, 1.2);
      });

    wrapper
      .select(".zoom-out")
      .on("click", null)
      .on("click", () => {
        svg.transition().call(zoom.scaleBy, 0.8);
      });
  }

  // ================= PARALLEL =================
  function renderParallel() {
    if (selectedDefaultAttrs.length < 2) return;

    const dimensions = selectedDefaultAttrs;

    const svg = d3
      .select("#parallelChart")
      .append("svg")
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("width", "100%")
      .attr("height", "100%");

    const g = svg.append("g");

    const x = d3.scalePoint().domain(dimensions).range([50, 650]);

    const y = {};
    dimensions.forEach((dim) => {
      y[dim] = d3
        .scaleLinear()
        .domain(d3.extent(data, (d) => d[dim]))
        .range([350, 50]);
    });

    function path(d) {
      return d3.line()(dimensions.map((p) => [x(p), y[p](d[p])]));
    }

    g.selectAll("path")
      .data(data)
      .enter()
      .append("path")
      .attr("class", "scatter-point")
      .attr("d", path)
      .attr("fill", "none")
      .attr("stroke", (d) => color(d[target]))
      .attr("opacity", 1)
      .on("mouseover", (e, d) => highlightAll(d[target]))
      .on("mouseout", resetHighlight);

    dimensions.forEach((dim) => {
      g.append("g")
        .attr("transform", `translate(${x(dim)},0)`)
        .call(d3.axisLeft(y[dim]));

      g.append("text")
        .attr("x", x(dim))
        .attr("y", 20)
        .text(dim)
        .attr("text-anchor", "middle");
    });

    const zoom = d3
      .zoom()
      .scaleExtent([0.5, 5])
      .translateExtent([
        [0, 0],
        [width, height],
      ])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
      });

    svg.call(zoom);

    const wrapper = d3.select("#parallelWrapper");

    wrapper.select(".zoom-in").on("click", () => {
      svg.transition().call(zoom.scaleBy, 1.2);
    });

    wrapper.select(".zoom-out").on("click", () => {
      svg.transition().call(zoom.scaleBy, 0.8);
    });
  }

  // ================= PIE =================
  function renderPie() {
    const svg = d3
      .select("#pieChart")
      .append("svg")
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("width", "100%")
      .attr("height", "100%");

    const zoomLayer = svg.append("g");

    const g = zoomLayer
      .append("g")
      .attr("transform", `translate(${width / 2}, ${height / 2})`);

    const radius = Math.min(width, height) / 2 - 40;

    // ===== GROUP DATA =====
    const grouped = d3.rollups(
      data,
      (v) => v.length,
      (d) => d[target],
    );

    const total = d3.sum(grouped, (d) => d[1]);

    const pie = d3
      .pie()
      .value((d) => d[1])
      .sort(null);

    const arc = d3.arc().innerRadius(0).outerRadius(radius);

    const labelArc = d3
      .arc()
      .innerRadius(radius * 0.75)
      .outerRadius(radius * 0.75);

    const arcs = g.selectAll("arc").data(pie(grouped)).enter().append("g");

    // ===== SLICE =====
    arcs
      .append("path")
      .attr("class", "pie-slice")
      .attr("d", arc)
      .attr("fill", (d) => color(d.data[0]))
      .attr("stroke", "#fff")
      .style("stroke-width", "1px")
      .on("mouseover", (e, d) => {
        const key = d.data[0];
        highlightAll(key);
      })
      .on("mouseout", resetHighlight);

    // ===== LABEL =====
    arcs
      .append("text")
      .attr("transform", (d) => `translate(${labelArc.centroid(d)})`)
      .attr("text-anchor", "middle")
      .style("font-size", "11px")
      .style("pointer-events", "none")
      .text((d) => {
        const percent = d.data[1] / total;
        if (percent < 0.05) return "";
        return `${(percent * 100).toFixed(0)}%`;
      });

    // ===== TOOLTIP =====
    const tooltip = d3
      .select("body")
      .append("div")
      .style("position", "absolute")
      .style("padding", "6px 10px")
      .style("background", "#333")
      .style("color", "#fff")
      .style("font-size", "12px")
      .style("border-radius", "4px")
      .style("pointer-events", "none")
      .style("opacity", 0);

    arcs
      .on("mousemove", (e, d) => {
        const percent = ((d.data[1] / total) * 100).toFixed(1);

        tooltip
          .style("opacity", 1)
          .html(
            `<b>${d.data[0]}</b><br/>
           Count: ${d.data[1]}<br/>
           ${percent}%`,
          )
          .style("left", e.pageX + 10 + "px")
          .style("top", e.pageY + "px");
      })
      .on("mouseout", () => tooltip.style("opacity", 0));

    // ===== ZOOM =====
    const zoom = d3
      .zoom()
      .scaleExtent([0.7, 5])
      .on("zoom", (event) => {
        zoomLayer.attr("transform", event.transform);
      });

    svg.call(zoom);

    const wrapper = d3.select("#pieWrapper");

    wrapper.select(".zoom-in").on("click", () => {
      svg.transition().call(zoom.scaleBy, 1.2);
    });

    wrapper.select(".zoom-out").on("click", () => {
      svg.transition().call(zoom.scaleBy, 0.8);
    });
  }

  // ================= LEGEND =================
  function createLegend() {
    const container = d3.select("#legend");

    ["1", "2", "3"].forEach((o) => {
      const item = container.append("div").attr("class", "legend-item");

      item
        .append("span")
        .style("background", color(o))
        .style("display", "inline-block")
        .style("width", "10px")
        .style("height", "10px")
        .style("margin-right", "5px");

      item.append("span").text(" " + o);
    });
  }

  function highlightAll(key) {
    // SCATTER
    d3.selectAll(".scatter-point").attr("opacity", (d) =>
      d && d[target] === key ? 1 : 0.1,
    );

    // PARALLEL
    d3.selectAll(".parallel-line").attr("opacity", (d) =>
      d && d[target] === key ? 1 : 0.05,
    );

    // BAR
    d3.selectAll(".bar-rect").attr("opacity", (d) =>
      d && d.group === key ? 1 : 0.2,
    );

    // PIE
    d3.selectAll(".pie-slice").attr("opacity", (d) =>
      d && d.data && d.data[0] === key ? 1 : 0.2,
    );
  }

  function highlightBarOnly(dHover) {
    // BAR (chỉ 1 cột)
    d3.selectAll(".bar-rect").attr("opacity", (d) =>
      d.group === dHover.group && d.key === dHover.key ? 1 : 0.2,
    );

    // SCATTER (vẫn theo group)
    d3.selectAll(".scatter-point").attr("opacity", (d) =>
      d[target] === dHover.group ? 1 : 0.1,
    );

    // PARALLEL
    d3.selectAll(".parallel-line").attr("opacity", (d) =>
      d[target] === dHover.group ? 1 : 0.05,
    );

    // PIE
    d3.selectAll(".pie-slice").attr("opacity", (d) =>
      d.data[0] === dHover.group ? 1 : 0.2,
    );
  }

  function resetHighlight() {
    d3.selectAll(".scatter-point").attr("opacity", 0.7);
    d3.selectAll(".parallel-line").attr("opacity", 1);
    d3.selectAll(".bar-rect").attr("opacity", 1);
    d3.selectAll(".pie-slice").attr("opacity", 1);
  }

  // ================= FULLSCREEN =================
  d3.selectAll(".chart").on("click", function () {
    const isFull = d3.select(this).classed("fullscreen");
    d3.selectAll(".chart").classed("fullscreen", false);

    if (!isFull) {
      d3.select(this).classed("fullscreen", true);
    }
  });
});
