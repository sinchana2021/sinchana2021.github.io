import * as d3 from "npm:d3";

export function layoffHeatmap(data, { width = 900 } = {}) {

  // parse and filter data
  const parseDate = d3.timeParse("%Y-%m-%d");

  const rows = data
    .filter(d => d.Laid_Off != null && !isNaN(+d.Laid_Off) && +d.Laid_Off > 0)
    .map(d => ({
      company:  d.Company,
      industry: d.Industry,
      country:  d.Country,
      laid_off: +d.Laid_Off,
      date:     parseDate(d.Date_layoffs) ?? new Date(d.Date_layoffs),
    }))
    .filter(d => d.date != null && d.industry != null);

  function toQuarter(date) {
    return `${date.getFullYear()}-Q${Math.ceil((date.getMonth() + 1) / 3)}`;
  }

  // fixed at all data
  const allQuarters = Array.from(new Set(rows.map(d => toQuarter(d.date)))).sort();

  // country dropdown
  const countries = ["All", ...Array.from(new Set(rows.map(d => d.country)))
    .filter(Boolean).sort()];

  // wrapper div
  const container = d3.create("div")
    .style("font-family", "var(--sans-serif, system-ui, sans-serif)");

  // filter bar
  const filterBar = container.append("div")
    .style("display", "flex")
    .style("align-items", "center")
    .style("gap", "10px")
    .style("margin-bottom", "12px");

  filterBar.append("label")
    .attr("for", "country-select")
    .style("font-size", "13px")
    .style("font-weight", "600")
    .text("Filter by country:");

  const select = filterBar.append("select")
    .attr("id", "country-select")
    .style("font-size", "13px")
    .style("padding", "4px 8px")
    .style("border", "1px solid #ccc")
    .style("border-radius", "4px")
    .style("cursor", "pointer");

  select.selectAll("option")
    .data(countries)
    .join("option")
    .attr("value", d => d)
    .text(d => d);

  // count label
  const countLabel = filterBar.append("span")
    .style("font-size", "12px")
    .style("color", "#888");

  // svg container
  const svgContainer = container.append("div");

  function draw(selectedCountry) {
    svgContainer.selectAll("*").remove();

    // filter by country
    const filtered = selectedCountry === "All"
      ? rows
      : rows.filter(d => d.country === selectedCountry);

    // update counts
    const total = d3.sum(filtered, d => d.laid_off);
    countLabel.text(`${d3.format(",")(filtered.length)} events · ${d3.format(",")(total)} total laid off`);

    // create cells
    const cellMap = new Map();
    for (const row of filtered) {
      const key = `${row.industry}||${toQuarter(row.date)}`;
      if (!cellMap.has(key)) cellMap.set(key, { total: 0, companies: [] });
      const cell = cellMap.get(key);
      cell.total += row.laid_off;
      cell.companies.push({ company: row.company, laid_off: row.laid_off });
    }

    const industries = Array.from(new Set(filtered.map(d => d.industry)))
      .filter(Boolean).sort();

    const cells = [];
    for (const industry of industries) {
      for (const quarter of allQuarters) {
        const entry = cellMap.get(`${industry}||${quarter}`) ?? { total: 0, companies: [] };
        cells.push({ industry, quarter, total: entry.total, companies: entry.companies });
      }
    }

    // layout
    const marginTop = 30, marginRight = 20, marginBottom = 80, marginLeft = 180;
    const cellH = 26;
    const height = marginTop + industries.length * cellH + marginBottom;

    const xScale = d3.scaleBand()
      .domain(allQuarters)
      .range([marginLeft, width - marginRight])
      .padding(0.08);

    const yScale = d3.scaleBand()
      .domain(industries)
      .range([marginTop, marginTop + industries.length * cellH])
      .padding(0.08);

    const color = d3.scaleSequential()
      .domain([0, d3.max(cells, d => d.total) || 1])
      .interpolator(d3.interpolateYlOrRd);

    // svg
    const svg = svgContainer.append("svg")
      .attr("width", width)
      .attr("height", height)
      .style("background", "var(--theme-background, #fff)");

    // X axis
    svg.append("g")
      .attr("transform", `translate(0,${marginTop + industries.length * cellH + 6})`)
      .call(d3.axisBottom(xScale).tickSize(0))
      .call(g => g.select(".domain").remove())
      .call(g => g.selectAll("text")
        .style("font-size", "10px")
        .attr("transform", "rotate(-45)")
        .attr("text-anchor", "end")
        .attr("dy", "0.5em"));

    // Y axis
    svg.append("g")
      .attr("transform", `translate(${marginLeft - 6},0)`)
      .call(d3.axisLeft(yScale).tickSize(0))
      .call(g => g.select(".domain").remove())
      .call(g => g.selectAll("text").style("font-size", "11px"));

    // empty cells
    svg.selectAll("rect.empty")
      .data(cells.filter(d => d.total === 0))
      .join("rect")
        .attr("class", "empty")
        .attr("x", d => xScale(d.quarter))
        .attr("y", d => yScale(d.industry))
        .attr("width",  xScale.bandwidth())
        .attr("height", yScale.bandwidth())
        .attr("rx", 3)
        .attr("fill", "#f0f0f0");

    // cells
    svg.selectAll("rect.cell")
      .data(cells.filter(d => d.total > 0))
      .join("rect")
        .attr("class", "cell")
        .attr("x", d => xScale(d.quarter))
        .attr("y", d => yScale(d.industry))
        .attr("width",  xScale.bandwidth())
        .attr("height", yScale.bandwidth())
        .attr("rx", 3)
        .attr("fill", d => color(d.total))
        .attr("opacity", 0.9)
        .style("cursor", "pointer")
        .on("mouseenter", function(event, d) {
          d3.select(this)
            .attr("stroke", "#333")
            .attr("stroke-width", 2)
            .attr("opacity", 1)
            .attr("filter", "brightness(1.3)");
          showTooltip(event, d);
        })
        .on("mousemove", moveTooltip)
        .on("mouseleave", function() {
          d3.select(this)
            .attr("stroke", null)
            .attr("stroke-width", null)
            .attr("opacity", 0.9)
            .attr("filter", null);
          hideTooltip();
        });

    // legend
    const legendW = 140, legendH = 10;
    const legendX = width - marginRight - legendW;
    const legendY = 10;

    const defs = svg.append("defs");
    const grad = defs.append("linearGradient").attr("id", "heatmap-legend-grad");
    d3.range(0, 1.01, 0.1).forEach(t => {
      grad.append("stop")
        .attr("offset", `${t * 100}%`)
        .attr("stop-color", color(t * (d3.max(cells, d => d.total) || 1)));
    });

    svg.append("rect")
      .attr("x", legendX).attr("y", legendY)
      .attr("width", legendW).attr("height", legendH)
      .attr("rx", 2)
      .attr("fill", "url(#heatmap-legend-grad)");

    svg.append("text")
      .attr("x", legendX).attr("y", legendY - 3)
      .style("font-size", "9px").attr("fill", "#666").text("Fewer layoffs");

    svg.append("text")
      .attr("x", legendX + legendW).attr("y", legendY - 3)
      .style("font-size", "9px").attr("fill", "#666")
      .attr("text-anchor", "end").text("More layoffs");
  }

  // tooltip
  const tip = d3.select(document.body)
    .append("div")
    .style("position", "fixed")
    .style("pointer-events", "none")
    .style("background", "white")
    .style("border", "1px solid #ddd")
    .style("border-radius", "6px")
    .style("padding", "10px 14px")
    .style("font-size", "12px")
    .style("font-family", "var(--sans-serif, system-ui, sans-serif)")
    .style("box-shadow", "0 4px 16px rgba(0,0,0,0.12)")
    .style("min-width", "200px")
    .style("z-index", "9999")
    .style("display", "none");

  function showTooltip(event, d) {
    const topCos = [...d.companies]
      .sort((a, b) => b.laid_off - a.laid_off)
      .slice(0, 7);
    tip.html(`
      <div style="font-weight:700;margin-bottom:2px">${d.industry}</div>
      <div style="color:#888;margin-bottom:8px;font-size:11px">${d.quarter}</div>
      <div style="font-size:15px;font-weight:700;margin-bottom:8px">
        ${d3.format(",")(d.total)} laid off
      </div>
      <ul style="margin:0;padding-left:14px;color:#444">
        ${topCos.map(c =>
          `<li>${c.company} — ${d3.format(",")(c.laid_off)}</li>`
        ).join("")}
      </ul>
      ${d.companies.length > 7
        ? `<div style="color:#aaa;font-size:10px;margin-top:6px">
             + ${d.companies.length - 7} more companies
           </div>`
        : ""}
    `)
    .style("display", "block");
    moveTooltip(event);
  }

  function moveTooltip(event) {
    const x = event.clientX, y = event.clientY;
    const tw = 220, th = 200;
    tip
      .style("left", `${x + 14 + tw > window.innerWidth  ? x - tw - 10 : x + 14}px`)
      .style("top",  `${y + 14 + th > window.innerHeight ? y - th - 10 : y + 14}px`);
  }

  function hideTooltip() {
    tip.style("display", "none");
  }

  draw("All");

  select.on("change", function() {
    draw(this.value);
  });

  return container.node();
}