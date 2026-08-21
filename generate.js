const fs = require('fs');
const path = require('path');

// 格式化数字（带千分位）
function formatNum(num) {
    return Math.round(num || 0).toLocaleString('en-US');
}

// 格式化紧凑数字（K, M, B）
function formatCompact(num) {
    num = Number(num) || 0;
    if (num >= 1e9) {
        return (num / 1e9).toFixed(2) + ' B';
    }
    if (num >= 1e6) {
        return (num / 1e6).toFixed(2) + ' M';
    }
    if (num >= 1e3) {
        return (num / 1e3).toFixed(1) + ' K';
    }
    return String(num);
}

// 转义 XML/SVG 字符
function escapeXml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

// 读取并解析 stats.json
function loadStats(statsPath) {
    if (!fs.existsSync(statsPath)) {
        return [];
    }
    try {
        const raw = fs.readFileSync(statsPath, 'utf-8');
        if (!raw.trim()) return [];
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
            return parsed.sort((a, b) => (a.date > b.date ? 1 : -1));
        }
        if (typeof parsed === 'object' && parsed !== null) {
            return Object.entries(parsed).map(([k, v]) => ({
                date: v.date || k,
                conversations: Number(v.conversations || 0),
                turns: Number(v.turns || 0),
                input_chars: Number(v.input_chars || 0),
                output_chars: Number(v.output_chars || 0)
            })).sort((a, b) => (a.date > b.date ? 1 : -1));
        }
        return [];
    } catch {
        return [];
    }
}

// 计算统计汇总数据
function computeMetrics(dataList) {
    let totalInChars = 0;
    let totalOutChars = 0;
    let totalTurns = 0;
    let totalConvs = 0;
    let peakDay = null;
    let maxDayChars = 0;

    const monthlyMap = {};

    for (const item of dataList) {
        const inC = Number(item.input_chars) || 0;
        const outC = Number(item.output_chars) || 0;
        const turns = Number(item.turns) || 0;
        const convs = Number(item.conversations) || 0;
        const dayTot = inC + outC;

        totalInChars += inC;
        totalOutChars += outC;
        totalTurns += turns;
        totalConvs += convs;

        if (dayTot > maxDayChars) {
            maxDayChars = dayTot;
            peakDay = item.date;
        }

        const mStr = (item.date || '').substring(0, 7) || 'Unknown';
        if (!monthlyMap[mStr]) {
            monthlyMap[mStr] = {
                month: mStr,
                input_chars: 0,
                output_chars: 0,
                turns: 0,
                conversations: 0,
                days: 0
            };
        }
        monthlyMap[mStr].input_chars += inC;
        monthlyMap[mStr].output_chars += outC;
        monthlyMap[mStr].turns += turns;
        monthlyMap[mStr].conversations += convs;
        monthlyMap[mStr].days += 1;
    }

    const totalChars = totalInChars + totalOutChars;
    const activeDays = dataList.length;
    const avgCharsPerTurn = totalTurns > 0 ? Math.round(totalChars / totalTurns) : 0;
    const avgCharsPerDay = activeDays > 0 ? Math.round(totalChars / activeDays) : 0;

    return {
        totalInChars,
        totalOutChars,
        totalChars,
        totalTurns,
        totalConvs,
        activeDays,
        avgCharsPerTurn,
        avgCharsPerDay,
        peakDay,
        maxDayChars,
        monthly: Object.values(monthlyMap).sort((a, b) => (a.month > b.month ? 1 : -1))
    };
}

// 1. 生成 Overview Card SVG
function generateOverviewSvg(metrics, updatedAt) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 880 320" width="100%" height="100%">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0d1117" />
      <stop offset="50%" stop-color="#161b22" />
      <stop offset="100%" stop-color="#0f172a" />
    </linearGradient>
    <linearGradient id="cardGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.15" />
      <stop offset="100%" stop-color="#0284c7" stop-opacity="0.03" />
    </linearGradient>
    <linearGradient id="cardGrad2" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#c084fc" stop-opacity="0.15" />
      <stop offset="100%" stop-color="#7e22ce" stop-opacity="0.03" />
    </linearGradient>
    <linearGradient id="cardGrad3" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#34d399" stop-opacity="0.15" />
      <stop offset="100%" stop-color="#059669" stop-opacity="0.03" />
    </linearGradient>
    <linearGradient id="cardGrad4" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#fbbf24" stop-opacity="0.15" />
      <stop offset="100%" stop-color="#d97706" stop-opacity="0.03" />
    </linearGradient>
    <linearGradient id="accentLine" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#38bdf8" />
      <stop offset="35%" stop-color="#818cf8" />
      <stop offset="70%" stop-color="#c084fc" />
      <stop offset="100%" stop-color="#34d399" />
    </linearGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="6" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>
  </defs>

  <style>
    .font-sans { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; }
    .title { font-size: 19px; font-weight: 700; fill: #f0f6fc; letter-spacing: 0.3px; }
    .subtitle { font-size: 12px; fill: #8b949e; }
    .card-label { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.8px; }
    .card-val { font-size: 26px; font-weight: 800; }
    .card-sub { font-size: 11px; fill: #8b949e; }
    .pill-text { font-size: 12px; fill: #c9d1d9; }
    .tag-badge { font-size: 11px; font-weight: 600; fill: #38bdf8; }
  </style>

  <!-- Background Panel -->
  <rect x="1" y="1" width="878" height="318" rx="14" fill="url(#bgGrad)" stroke="#30363d" stroke-width="1.2" />

  <!-- Top Glowing Accent Line -->
  <path d="M 14 1 L 866 1" stroke="url(#accentLine)" stroke-width="2.5" stroke-linecap="round" />

  <!-- Header Section -->
  <g transform="translate(30, 26)">
    <!-- Icon Pulsing Circle -->
    <circle cx="16" cy="16" r="16" fill="#1f293d" stroke="#38bdf8" stroke-width="1.5" />
    <path d="M 11 16 L 15 20 L 22 12" fill="none" stroke="#38bdf8" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />

    <text x="44" y="14" class="font-sans title">Antigravity Activity Dashboard</text>
    <text x="44" y="31" class="font-sans subtitle">Real-time LLM interaction &amp; token trace metrics • Synchronized from local logs</text>

    <!-- Top-right Status Pill -->
    <g transform="translate(680, 4)">
      <rect x="0" y="0" width="138" height="26" rx="13" fill="#1f2937" stroke="#374151" stroke-width="1" />
      <circle cx="14" cy="13" r="4.5" fill="#10b981" filter="url(#glow)" />
      <text x="26" y="17" class="font-sans tag-badge">Auto Synced</text>
    </g>
  </g>

  <!-- 4 Metric Cards (Row 1) -->
  <!-- Card 1: Input Chars -->
  <g transform="translate(30, 85)">
    <rect width="192" height="135" rx="10" fill="url(#cardGrad1)" stroke="#0284c7" stroke-opacity="0.35" stroke-width="1" />
    <circle cx="26" cy="28" r="12" fill="#0369a1" fill-opacity="0.25" />
    <text x="26" y="32" text-anchor="middle" font-size="12" fill="#38bdf8">📥</text>
    <text x="48" y="32" class="font-sans card-label" fill="#38bdf8">Input Chars</text>
    <text x="20" y="75" class="font-sans card-val" fill="#e0f2fe">${escapeXml(formatCompact(metrics.totalInChars))}</text>
    <text x="20" y="98" class="font-sans card-sub">Exact: ${escapeXml(formatNum(metrics.totalInChars))}</text>
    <text x="20" y="116" class="font-sans card-sub" fill="#60a5fa">Prompt context chars</text>
  </g>

  <!-- Card 2: Output Chars -->
  <g transform="translate(236, 85)">
    <rect width="192" height="135" rx="10" fill="url(#cardGrad2)" stroke="#7e22ce" stroke-opacity="0.35" stroke-width="1" />
    <circle cx="26" cy="28" r="12" fill="#6b21a8" fill-opacity="0.25" />
    <text x="26" y="32" text-anchor="middle" font-size="12" fill="#c084fc">📤</text>
    <text x="48" y="32" class="font-sans card-label" fill="#c084fc">Output Chars</text>
    <text x="20" y="75" class="font-sans card-val" fill="#f3e8ff">${escapeXml(formatCompact(metrics.totalOutChars))}</text>
    <text x="20" y="98" class="font-sans card-sub">Exact: ${escapeXml(formatNum(metrics.totalOutChars))}</text>
    <text x="20" y="116" class="font-sans card-sub" fill="#c084fc">Model generated chars</text>
  </g>

  <!-- Card 3: Total Turns -->
  <g transform="translate(442, 85)">
    <rect width="192" height="135" rx="10" fill="url(#cardGrad3)" stroke="#059669" stroke-opacity="0.35" stroke-width="1" />
    <circle cx="26" cy="28" r="12" fill="#065f46" fill-opacity="0.25" />
    <text x="26" y="32" text-anchor="middle" font-size="12" fill="#34d399">💬</text>
    <text x="48" y="32" class="font-sans card-label" fill="#34d399">Total Turns</text>
    <text x="20" y="75" class="font-sans card-val" fill="#d1fae5">${escapeXml(formatNum(metrics.totalTurns))}</text>
    <text x="20" y="98" class="font-sans card-sub">Avg: ~${escapeXml(formatCompact(metrics.avgCharsPerTurn))} chars/turn</text>
    <text x="20" y="116" class="font-sans card-sub" fill="#34d399">Multi-turn interactions</text>
  </g>

  <!-- Card 4: Conversations -->
  <g transform="translate(648, 85)">
    <rect width="202" height="135" rx="10" fill="url(#cardGrad4)" stroke="#d97706" stroke-opacity="0.35" stroke-width="1" />
    <circle cx="26" cy="28" r="12" fill="#92400e" fill-opacity="0.25" />
    <text x="26" y="32" text-anchor="middle" font-size="12" fill="#fbbf24">📁</text>
    <text x="48" y="32" class="font-sans card-label" fill="#fbbf24">Conversations</text>
    <text x="20" y="75" class="font-sans card-val" fill="#fef3c7">${escapeXml(formatNum(metrics.totalConvs))}</text>
    <text x="20" y="98" class="font-sans card-sub">Active Days: ${escapeXml(metrics.activeDays)} days</text>
    <text x="20" y="116" class="font-sans card-sub" fill="#fbbf24">Tracked brain sessions</text>
  </g>

  <!-- Bottom Footer Ribbon -->
  <g transform="translate(30, 238)">
    <rect width="820" height="58" rx="8" fill="#161b22" stroke="#21262d" stroke-width="1" />

    <!-- Info Item 1 -->
    <g transform="translate(20, 33)">
      <text class="font-sans pill-text">
        <tspan fill="#8b949e">🏆 Peak Activity: </tspan>
        <tspan font-weight="700" fill="#f0f6fc">${escapeXml(metrics.peakDay || 'N/A')}</tspan>
        <tspan fill="#38bdf8"> (${escapeXml(formatCompact(metrics.maxDayChars))} Chars)</tspan>
      </text>
    </g>

    <!-- Info Item 2 -->
    <g transform="translate(320, 33)">
      <text class="font-sans pill-text">
        <tspan fill="#8b949e">⚡ Daily Average: </tspan>
        <tspan font-weight="700" fill="#34d399">${escapeXml(formatCompact(metrics.avgCharsPerDay))} Chars/Day</tspan>
      </text>
    </g>

    <!-- Info Item 3 -->
    <g transform="translate(600, 33)">
      <text class="font-sans pill-text">
        <tspan fill="#8b949e">🕒 Updated: </tspan>
        <tspan font-weight="600" fill="#c9d1d9">${escapeXml(updatedAt)}</tspan>
      </text>
    </g>
  </g>
</svg>`;
}

// 2. 生成 Daily Trend Activity Chart SVG (仅统计最近 7 天)
function generateDailyTrendSvg(dataList) {
    const width = 880;
    const height = 370;
    const padding = { top: 70, right: 35, bottom: 50, left: 75 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    // 只保留最近 7 天
    const recentList = dataList.slice(-7);

    if (recentList.length === 0) {
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 880 370" width="100%" height="100%">
      <rect width="880" height="370" rx="14" fill="#0d1117" stroke="#30363d" />
      <text x="440" y="185" fill="#8b949e" font-family="sans-serif" text-anchor="middle">暂无近 7 天日统计数据</text>
    </svg>`;
    }

    // 计算最大 Y 值
    let maxVal = 0;
    for (const item of recentList) {
        const tot = (Number(item.input_chars) || 0) + (Number(item.output_chars) || 0);
        if (tot > maxVal) maxVal = tot;
    }
    if (maxVal <= 0) maxVal = 1000;

    const yTicks = 4;
    const niceMax = Math.ceil(maxVal * 1.15);

    const n = recentList.length;
    const points = recentList.map((item, idx) => {
        const val = (Number(item.input_chars) || 0) + (Number(item.output_chars) || 0);
        const x = n === 1 ? padding.left + chartW / 2 : padding.left + (idx / (n - 1)) * chartW;
        const y = padding.top + chartH - (val / niceMax) * chartH;
        return {
            x,
            y,
            val,
            inVal: Number(item.input_chars) || 0,
            outVal: Number(item.output_chars) || 0,
            turns: Number(item.turns) || 0,
            convs: Number(item.conversations) || 0,
            date: item.date
        };
    });

    let pathD = '';
    let areaD = '';

    if (points.length === 1) {
        pathD = `M ${points[0].x - 30} ${points[0].y} L ${points[0].x + 30} ${points[0].y}`;
        areaD = `M ${points[0].x - 30} ${padding.top + chartH} L ${points[0].x - 30} ${points[0].y} L ${points[0].x + 30} ${points[0].y} L ${points[0].x + 30} ${padding.top + chartH} Z`;
    } else {
        pathD = `M ${points[0].x} ${points[0].y}`;
        for (let i = 0; i < points.length - 1; i++) {
            const p0 = points[Math.max(i - 1, 0)];
            const p1 = points[i];
            const p2 = points[i + 1];
            const p3 = points[Math.min(i + 2, points.length - 1)];

            const cp1x = p1.x + (p2.x - p0.x) / 6;
            const cp1y = p1.y + (p2.y - p0.y) / 6;
            const cp2x = p2.x - (p3.x - p1.x) / 6;
            const cp2y = p2.y - (p3.y - p1.y) / 6;

            pathD += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
        }
        areaD = `${pathD} L ${points[points.length - 1].x} ${padding.top + chartH} L ${points[0].x} ${padding.top + chartH} Z`;
    }

    let gridElements = '';
    for (let i = 0; i <= yTicks; i++) {
        const tickVal = (niceMax / yTicks) * i;
        const tickY = padding.top + chartH - (i / yTicks) * chartH;
        gridElements += `
    <line x1="${padding.left}" y1="${tickY}" x2="${width - padding.right}" y2="${tickY}" stroke="#21262d" stroke-dasharray="3,3" stroke-width="1" />
    <text x="${padding.left - 12}" y="${tickY + 4}" text-anchor="end" font-size="11" fill="#8b949e" font-family="-apple-system, sans-serif">${escapeXml(formatCompact(tickVal))}</text>`;
    }

    let dataPointsSvg = '';
    let xLabelsSvg = '';

    for (let i = 0; i < points.length; i++) {
        const pt = points[i];
        const dateLabel = pt.date ? pt.date.substring(5) : '';

        xLabelsSvg += `
    <text x="${pt.x}" y="${height - padding.bottom + 24}" text-anchor="middle" font-size="11" font-weight="600" fill="#8b949e" font-family="-apple-system, sans-serif">${escapeXml(dateLabel)}</text>`;

        dataPointsSvg += `
    <g class="data-point">
      <circle cx="${pt.x}" cy="${pt.y}" r="6" fill="#0d1117" stroke="#38bdf8" stroke-width="2.5" />
      <circle cx="${pt.x}" cy="${pt.y}" r="2.5" fill="#38bdf8" />
      <text x="${pt.x}" y="${pt.y - 12}" text-anchor="middle" font-size="11" font-weight="700" fill="#e0f2fe" font-family="-apple-system, sans-serif">${escapeXml(formatCompact(pt.val))}</text>
    </g>`;
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" height="100%">
  <defs>
    <linearGradient id="trendBg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0d1117" />
      <stop offset="50%" stop-color="#161b22" />
      <stop offset="100%" stop-color="#0b1329" />
    </linearGradient>
    <linearGradient id="areaFill" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.4" />
      <stop offset="70%" stop-color="#6366f1" stop-opacity="0.1" />
      <stop offset="100%" stop-color="#0d1117" stop-opacity="0" />
    </linearGradient>
    <linearGradient id="lineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#38bdf8" />
      <stop offset="50%" stop-color="#818cf8" />
      <stop offset="100%" stop-color="#c084fc" />
    </linearGradient>
    <filter id="lineGlow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="3" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>
  </defs>

  <style>
    .chart-title { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 16px; font-weight: 700; fill: #f0f6fc; }
    .chart-sub { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 12px; fill: #8b949e; }
    .legend-text { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 11px; fill: #c9d1d9; }
    .pill-badge { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 11px; font-weight: 600; fill: #38bdf8; }
  </style>

  <!-- Background Panel -->
  <rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="14" fill="url(#trendBg)" stroke="#30363d" stroke-width="1.2" />

  <!-- Header -->
  <g transform="translate(30, 24)">
    <circle cx="12" cy="12" r="12" fill="#1e293b" stroke="#38bdf8" stroke-width="1.5" />
    <path d="M 6 15 L 10 10 L 14 13 L 18 8" fill="none" stroke="#38bdf8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    <text x="32" y="12" class="chart-title">Daily Activity Trend (Recent 7 Days)</text>
    <text x="32" y="28" class="chart-sub">Daily Total Characters (Input + Output) Activity Curve</text>
  </g>

  <!-- Legend & Scope Pill -->
  <g transform="translate(${width - 280}, 24)">
    <rect x="0" y="2" width="100" height="24" rx="12" fill="#1f2937" stroke="#374151" stroke-width="1" />
    <text x="50" y="17" text-anchor="middle" class="pill-badge">Last 7 Days</text>

    <rect x="115" y="8" width="10" height="10" rx="2" fill="#38bdf8" />
    <text x="132" y="17" class="legend-text">Total Chars</text>
  </g>

  <!-- Grid lines & Y Labels -->
  ${gridElements}

  <!-- X-Axis Baseline -->
  <line x1="${padding.left}" y1="${padding.top + chartH}" x2="${width - padding.right}" y2="${padding.top + chartH}" stroke="#30363d" stroke-width="1.2" />

  <!-- Area Fill -->
  <path d="${areaD}" fill="url(#areaFill)" />

  <!-- Trend Curve Line -->
  <path d="${pathD}" fill="none" stroke="url(#lineGrad)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" filter="url(#lineGlow)" />

  <!-- Data Points -->
  ${dataPointsSvg}

  <!-- X-Axis Date Labels -->
  ${xLabelsSvg}
</svg>`;
}

// 3. 生成 Monthly Trend Activity Chart SVG (最近 6 个月柱状与趋势图)
function generateMonthlyTrendSvg(monthlyList) {
    const width = 880;
    const height = 370;
    const padding = { top: 75, right: 40, bottom: 55, left: 75 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    // 只保留最近 6 个月
    const recentMonths = monthlyList.slice(-6);

    if (recentMonths.length === 0) {
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 880 370" width="100%" height="100%">
      <rect width="880" height="370" rx="14" fill="#0d1117" stroke="#30363d" />
      <text x="440" y="185" fill="#8b949e" font-family="sans-serif" text-anchor="middle">暂无近 6 个月月度统计数据</text>
    </svg>`;
    }

    let maxVal = 0;
    for (const item of recentMonths) {
        const tot = (Number(item.input_chars) || 0) + (Number(item.output_chars) || 0);
        if (tot > maxVal) maxVal = tot;
    }
    if (maxVal <= 0) maxVal = 1000;

    const yTicks = 4;
    const niceMax = Math.ceil(maxVal * 1.2);

    let gridElements = '';
    for (let i = 0; i <= yTicks; i++) {
        const tickVal = (niceMax / yTicks) * i;
        const tickY = padding.top + chartH - (i / yTicks) * chartH;
        gridElements += `
    <line x1="${padding.left}" y1="${tickY}" x2="${width - padding.right}" y2="${tickY}" stroke="#21262d" stroke-dasharray="3,3" stroke-width="1" />
    <text x="${padding.left - 12}" y="${tickY + 4}" text-anchor="end" font-size="11" fill="#8b949e" font-family="-apple-system, sans-serif">${escapeXml(formatCompact(tickVal))}</text>`;
    }

    const count = recentMonths.length;
    const slotWidth = chartW / count;
    const barWidth = Math.min(Math.max(slotWidth * 0.45, 36), 72);

    let barsSvg = '';
    let xLabelsSvg = '';

    for (let i = 0; i < count; i++) {
        const m = recentMonths[i];
        const totChars = (Number(m.input_chars) || 0) + (Number(m.output_chars) || 0);
        const barHeight = Math.max(4, (totChars / niceMax) * chartH);
        const xCenter = padding.left + i * slotWidth + slotWidth / 2;
        const barX = xCenter - barWidth / 2;
        const barY = padding.top + chartH - barHeight;

        // 柱状图条目
        barsSvg += `
    <g class="month-bar">
      <!-- Background glow on hover -->
      <rect x="${barX - 4}" y="${barY - 4}" width="${barWidth + 8}" height="${barHeight + 4}" rx="8" fill="#818cf8" fill-opacity="0.12" />
      <!-- Bar fill -->
      <rect x="${barX}" y="${barY}" width="${barWidth}" height="${barHeight}" rx="6" fill="url(#monthBarGrad)" stroke="#a855f7" stroke-width="1" />
      <!-- Top Accent -->
      <line x1="${barX + 2}" y1="${barY}" x2="${barX + barWidth - 2}" y2="${barY}" stroke="#e9d5ff" stroke-width="2" stroke-linecap="round" />
      <!-- Value text on top of bar -->
      <text x="${xCenter}" y="${barY - 10}" text-anchor="middle" font-size="12" font-weight="700" fill="#f3e8ff" font-family="-apple-system, sans-serif">${escapeXml(formatCompact(totChars))}</text>
      <!-- Sub-label: turns/convs -->
      <text x="${xCenter}" y="${barY - 26}" text-anchor="middle" font-size="10" fill="#c084fc" font-family="-apple-system, sans-serif">${escapeXml(formatNum(m.turns))} 轮</text>
    </g>`;

        // X 轴标签
        xLabelsSvg += `
    <g transform="translate(${xCenter}, ${height - padding.bottom + 20})">
      <text text-anchor="middle" font-size="12" font-weight="700" fill="#f0f6fc" font-family="-apple-system, sans-serif">${escapeXml(m.month)}</text>
      <text y="16" text-anchor="middle" font-size="10" fill="#8b949e" font-family="-apple-system, sans-serif">${escapeXml(m.days)} 天活跃 · ${escapeXml(m.conversations)} 对话</text>
    </g>`;
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" height="100%">
  <defs>
    <linearGradient id="monthBg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0d1117" />
      <stop offset="50%" stop-color="#161b22" />
      <stop offset="100%" stop-color="#1a102f" />
    </linearGradient>
    <linearGradient id="monthBarGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#c084fc" />
      <stop offset="40%" stop-color="#818cf8" />
      <stop offset="100%" stop-color="#4338ca" />
    </linearGradient>
  </defs>

  <style>
    .chart-title { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 16px; font-weight: 700; fill: #f0f6fc; }
    .chart-sub { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 12px; fill: #8b949e; }
    .legend-text { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 11px; fill: #c9d1d9; }
    .pill-badge { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 11px; font-weight: 600; fill: #c084fc; }
  </style>

  <!-- Background Panel -->
  <rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="14" fill="url(#monthBg)" stroke="#30363d" stroke-width="1.2" />

  <!-- Header -->
  <g transform="translate(30, 24)">
    <circle cx="12" cy="12" r="12" fill="#2e1065" stroke="#c084fc" stroke-width="1.5" />
    <path d="M 7 17 L 7 11 M 12 17 L 12 7 M 17 17 L 17 13" fill="none" stroke="#c084fc" stroke-width="2" stroke-linecap="round" />
    <text x="32" y="12" class="chart-title">Monthly Activity Trend (Recent 6 Months)</text>
    <text x="32" y="28" class="chart-sub">Monthly Total Characters &amp; Multi-turn Interaction Volumes</text>
  </g>

  <!-- Legend & Scope Pill -->
  <g transform="translate(${width - 300}, 24)">
    <rect x="0" y="2" width="112" height="24" rx="12" fill="#2d154d" stroke="#581c87" stroke-width="1" />
    <text x="56" y="17" text-anchor="middle" class="pill-badge">Last 6 Months</text>

    <rect x="128" y="8" width="10" height="10" rx="2" fill="#c084fc" />
    <text x="145" y="17" class="legend-text">Monthly Chars</text>
  </g>

  <!-- Grid lines & Y Labels -->
  ${gridElements}

  <!-- X-Axis Baseline -->
  <line x1="${padding.left}" y1="${padding.top + chartH}" x2="${width - padding.right}" y2="${padding.top + chartH}" stroke="#30363d" stroke-width="1.2" />

  <!-- Bars -->
  ${barsSvg}

  <!-- X-Axis Labels -->
  ${xLabelsSvg}
</svg>`;
}

// 4. 格式化生成 README 内容（按月表格在按日表格上方）
function generateReadmeContent(metrics, dataList, updatedAt) {
    // 生成月度汇总表格
    const monthlyRows = [...metrics.monthly].reverse().map(m => {
        const tot = m.input_chars + m.output_chars;
        return `| \`${m.month}\` | ${m.days} 天 | **${formatNum(m.conversations)}** | ${formatNum(m.turns)} | ${formatNum(m.input_chars)} | ${formatNum(m.output_chars)} | **${formatNum(tot)}** |`;
    }).join('\n');

    // 生成最近日期明细表格
    const dailyRows = [...dataList].reverse().map(item => {
        const inC = Number(item.input_chars) || 0;
        const outC = Number(item.output_chars) || 0;
        const tot = inC + outC;
        return `| \`${item.date}\` | **${formatNum(item.conversations)}** | ${formatNum(item.turns)} | ${formatNum(inC)} | ${formatNum(outC)} | **${formatNum(tot)}** |`;
    }).join('\n');

    return `<div align="center">

# ⚡ Antigravity Token & Activity Stat Tracker

<p align="center">
  <b>精细化追踪、聚合与可视化 Google Antigravity (AGY) 本地会话的 Token、字符与交互轮数统计</b>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-%3E%3D16-339933?style=flat-square&logo=node.js&logoColor=white" alt="Node Version" />
  <img src="https://img.shields.io/badge/Total_Chars-${encodeURIComponent(formatCompact(metrics.totalChars))}-38bdf8?style=flat-square&logo=speedtest&logoColor=white" alt="Total Chars" />
  <img src="https://img.shields.io/badge/Total_Turns-${encodeURIComponent(formatNum(metrics.totalTurns))}-34d399?style=flat-square&logo=counterstrike&logoColor=white" alt="Total Turns" />
  <img src="https://img.shields.io/badge/Active_Days-${metrics.activeDays}_Days-fbbf24?style=flat-square&logo=clockify&logoColor=white" alt="Active Days" />
  <img src="https://img.shields.io/badge/Zero_Dependencies-Pure_Node.js-818cf8?style=flat-square" alt="Zero Dependencies" />
</p>

</div>

---

## 📊 Overview Metrics

<div align="center">
  <img src="./assets/overview.svg" alt="Antigravity Overview Dashboard" width="100%" />
</div>

<br/>

## 🗓️ Monthly Trend (Recent 6 Months)

<div align="center">
  <img src="./assets/trend-monthly.svg" alt="Monthly Activity Trend" width="100%" />
</div>

<br/>

## 📅 Daily Activity Trend (Recent 7 Days)

<div align="center">
  <img src="./assets/trend-daily.svg" alt="Daily Activity Trend" width="100%" />
</div>

<br/>

---

## 📑 详细统计表格

<details open>
<summary><b>🗓️ 按月汇总记录 (Monthly Summary)</b></summary>
<br/>

| 月份 | 活跃天数 | 对话数 | 交互轮数 | 输入字符 | 输出字符 | 总字符消耗 |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
${monthlyRows}

</details>

<br/>

<details open>
<summary><b>📅 按日明细记录 (Daily Breakdown)</b></summary>
<br/>

| 日期 | 对话数 | 交互轮数 | 精准输入字符 | 精准输出字符 | 精准总字符消耗 |
| :--- | :---: | :---: | :---: | :---: | :---: |
${dailyRows}

</details>

<br/>

---

## 🚀 核心特性

- 🎯 **精准统计**：基于本地 Antigravity 真实 Trace 轨迹（\`transcript.jsonl\`），逐轮计算多轮对话上下文累加输入字符与输出字符。
- 🛡️ **智能防丢与合并策略**：
  - 用户清理本地历史会话时，旧日期的记录**永久保留在 JSON 中**。
  - 同一天内多次执行时，数据采用 \`Math.max(历史值, 新值)\`，确保单调递增不回退。
- 🎨 **纯原生零依赖 SVG 渲染**：无需 Canvas 或 Native 依赖，秒级生成现代化暗黑拟态图表（支持近 6 个月月度统计与近 7 天日度趋势）。
- ⚡ **一键本地全自动联动**：执行 \`node analyze.js\` 即可自动同步 JSON、重绘 SVG 看板并刷新 README。

---

## 💻 快速使用

### 1. 扫描并同步最新本地轨迹
\`\`\`bash
# 扫描本地 Antigravity Trace 并更新 stats.json & 生成图表
node analyze.js
\`\`\`

### 2. 独立生成 / 刷新图表与 README
\`\`\`bash
node generate.js
\`\`\`

### 3. CLI 高级选项
\`\`\`bash
node analyze.js --help

Options:
  --ratio <num>        字符与 Token 换算比例 (默认: 3.5)
  --days <num>         终端按日表格展示最近天数 (默认: 30)
  --month <str>        过滤指定月份 (如 2026-08)
  --no-daily           仅显示按月汇总表格
  --output, -o <path>  指定 JSON 输出路径 (默认: stats.json)
  --no-json            不写入/更新 JSON 文件
\`\`\`

---

<div align="center">
  <sub>Last Synced: <code>${updatedAt}</code> • Powered by <b>Antigravity Stat Tracker</b></sub>
</div>
`;
}

// 主函数
function run() {
    const statsPath = path.resolve(process.cwd(), 'stats.json');
    const assetsDir = path.resolve(process.cwd(), 'assets');
    const readmePath = path.resolve(process.cwd(), 'README.md');

    if (!fs.existsSync(assetsDir)) {
        fs.mkdirSync(assetsDir, { recursive: true });
    }

    const dataList = loadStats(statsPath);
    const metrics = computeMetrics(dataList);
    const now = new Date();
    const updatedAt = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    console.log(`[生成中] 正在分析 ${dataList.length} 条日期记录与 ${metrics.monthly.length} 个月度记录...`);

    // 1. 生成 overview.svg
    const overviewSvg = generateOverviewSvg(metrics, updatedAt);
    fs.writeFileSync(path.join(assetsDir, 'overview.svg'), overviewSvg, 'utf-8');
    console.log(`[已生成] assets/overview.svg`);

    // 2. 生成 trend-daily.svg 与兼容的 trend.svg (近 7 天)
    const dailyTrendSvg = generateDailyTrendSvg(dataList);
    fs.writeFileSync(path.join(assetsDir, 'trend-daily.svg'), dailyTrendSvg, 'utf-8');
    fs.writeFileSync(path.join(assetsDir, 'trend.svg'), dailyTrendSvg, 'utf-8');
    console.log(`[已生成] assets/trend-daily.svg (最近 7 天)`);

    // 3. 生成 trend-monthly.svg (近 6 个月)
    const monthlyTrendSvg = generateMonthlyTrendSvg(metrics.monthly);
    fs.writeFileSync(path.join(assetsDir, 'trend-monthly.svg'), monthlyTrendSvg, 'utf-8');
    console.log(`[已生成] assets/trend-monthly.svg (最近 6 个月)`);

    // 4. 生成 README.md (按月在按日上方)
    const readmeContent = generateReadmeContent(metrics, dataList, updatedAt);
    fs.writeFileSync(readmePath, readmeContent, 'utf-8');
    console.log(`[已更新] README.md`);

    console.log(`[完成] 所有图表与文档已更新完毕！`);
}

// 如果直接运行
if (require.main === module) {
    run();
}

module.exports = { run, computeMetrics, generateOverviewSvg, generateDailyTrendSvg, generateMonthlyTrendSvg, generateReadmeContent };
