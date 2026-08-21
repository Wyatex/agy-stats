#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');

// 递归/遍历查找所有 transcript.jsonl 文件
function findTranscriptFiles(brainDir) {
    const files = [];
    if (!fs.existsSync(brainDir)) {
        return files;
    }

    try {
        const entries = fs.readdirSync(brainDir, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isDirectory()) {
                const targetFile = path.join(brainDir, entry.name, '.system_generated', 'logs', 'transcript.jsonl');
                if (fs.existsSync(targetFile)) {
                    files.push(targetFile);
                }
            }
        }
    } catch (err) {
        // 忽略权限或读取错误
    }
    return files;
}

// 精准统计实际 Unicode 字符个数（正确处理 Emoji 和双字节字符）
function getExactCharCount(str) {
    if (typeof str !== 'string') return 0;
    return Array.from(str).length;
}

// 计算字符串在终端中的真实显示宽度（中文/全角字符占 2 宽，半角/英文占 1 宽）
function getDisplayWidth(str) {
    if (str == null) return 0;
    const s = String(str);
    let width = 0;
    for (let i = 0; i < s.length; i++) {
        const code = s.charCodeAt(i);
        // 处理高位代理（Emoji 等）
        if (code >= 0xD800 && code <= 0xDBFF) {
            width += 2;
            i++;
            continue;
        }
        // ASCII 可打印字符
        if (code >= 0x20 && code <= 0x7E) {
            width += 1;
        } else if (
            (code >= 0x1100 && code <= 0x115F) ||
            (code >= 0x2E80 && code <= 0xA4CF && code !== 0x303F) ||
            (code >= 0xAC00 && code <= 0xD7A3) ||
            (code >= 0xF900 && code <= 0xFAFF) ||
            (code >= 0xFE10 && code <= 0xFE19) ||
            (code >= 0xFE30 && code <= 0xFE6F) ||
            (code >= 0xFF00 && code <= 0xFF60) ||
            (code >= 0xFFE0 && code <= 0xFFE6)
        ) {
            // 中日韩字符与全角标点
            width += 2;
        } else if (code < 0x20 || (code >= 0x7F && code <= 0x9F)) {
            // 控制字符
            width += 0;
        } else {
            width += 1;
        }
    }
    return width;
}

// 终端对齐辅助函数（左对齐）
function padEndStr(str, targetWidth) {
    str = String(str ?? '');
    const currentWidth = getDisplayWidth(str);
    const padLen = Math.max(0, targetWidth - currentWidth);
    return str + ' '.repeat(padLen);
}

// 终端对齐辅助函数（右对齐）
function padStartStr(str, targetWidth) {
    str = String(str ?? '');
    const currentWidth = getDisplayWidth(str);
    const padLen = Math.max(0, targetWidth - currentWidth);
    return ' '.repeat(padLen) + str;
}

// 格式化输出数字（带千分位）
function formatNum(num) {
    return Math.round(num).toLocaleString('en-US');
}

// 同步统计数据到本地 JSON 文件（保留历史缺失日期，同日期取最大值）
function loadExistingJson(jsonPath) {
    if (!fs.existsSync(jsonPath)) {
        return {};
    }
    try {
        const raw = fs.readFileSync(jsonPath, 'utf-8');
        if (!raw.trim()) return {};
        const parsed = JSON.parse(raw);
        const map = {};
        if (Array.isArray(parsed)) {
            for (const item of parsed) {
                if (!item || typeof item !== 'object') continue;
                const d = item.date || item.日期 || item.dt;
                if (!d) continue;
                map[d] = {
                    date: String(d),
                    conversations: Number(item.conversations ?? item.conv ?? item.对话数 ?? 0) || 0,
                    turns: Number(item.turns ?? item.rounds ?? item.交互轮数 ?? 0) || 0,
                    input_chars: Number(item.input_chars ?? item.in_chars ?? item.输入字符 ?? 0) || 0,
                    output_chars: Number(item.output_chars ?? item.out_chars ?? item.输出字符 ?? 0) || 0
                };
            }
        } else if (typeof parsed === 'object' && parsed !== null) {
            for (const [k, item] of Object.entries(parsed)) {
                if (!item || typeof item !== 'object') continue;
                const d = item.date || item.日期 || k;
                map[d] = {
                    date: String(d),
                    conversations: Number(item.conversations ?? item.conv ?? item.对话数 ?? 0) || 0,
                    turns: Number(item.turns ?? item.rounds ?? item.交互轮数 ?? 0) || 0,
                    input_chars: Number(item.input_chars ?? item.in_chars ?? item.输入字符 ?? 0) || 0,
                    output_chars: Number(item.output_chars ?? item.out_chars ?? item.输出字符 ?? 0) || 0
                };
            }
        }
        return map;
    } catch (err) {
        console.warn(`[警告] 读取现有 JSON 文件失败 (${err.message})，将重新创建。`);
        return {};
    }
}

function syncStatsToJson(dailyStats, jsonPath) {
    const existingMap = loadExistingJson(jsonPath);
    const mergedMap = { ...existingMap };

    for (const [dateStr, stat] of Object.entries(dailyStats)) {
        if (!dateStr || dateStr === 'Unknown') continue;
        const currentConv = stat.convs ? stat.convs.size : (stat.conversations || 0);
        const currentTurns = stat.turns || 0;
        const currentInputChars = stat.input_chars || 0;
        const currentOutputChars = stat.output_chars || 0;

        if (!mergedMap[dateStr]) {
            mergedMap[dateStr] = {
                date: dateStr,
                conversations: currentConv,
                turns: currentTurns,
                input_chars: currentInputChars,
                output_chars: currentOutputChars
            };
        } else {
            const old = mergedMap[dateStr];
            mergedMap[dateStr] = {
                date: dateStr,
                conversations: Math.max(old.conversations || 0, currentConv),
                turns: Math.max(old.turns || 0, currentTurns),
                input_chars: Math.max(old.input_chars || 0, currentInputChars),
                output_chars: Math.max(old.output_chars || 0, currentOutputChars)
            };
        }
    }

    const sortedDates = Object.keys(mergedMap).sort();
    const resultList = sortedDates.map(d => mergedMap[d]);

    try {
        fs.writeFileSync(jsonPath, JSON.stringify(resultList, null, 2) + '\n', 'utf-8');
        const relativePath = path.relative(process.cwd(), jsonPath) || path.basename(jsonPath);
        console.log(`\n[数据已保存] 统计数据已同步写入至: ${relativePath} (共 ${resultList.length} 条日期记录)`);
    } catch (err) {
        console.error(`\n[错误] 写入 JSON 文件失败: ${err.message}`);
    }

    return resultList;
}

function analyzeTokens({ ratio = 3.5, showDaily = true, days = 30, filterMonth = null, jsonFile = 'stats.json', saveJson = true } = {}) {
    const brainDir = path.join(os.homedir(), '.gemini', 'antigravity-cli', 'brain');
    const files = findTranscriptFiles(brainDir);

    const dailyStats = {};
    const monthlyStats = {};

    const getOrInitStat = (map, key) => {
        if (!map[key]) {
            map[key] = { input_chars: 0, output_chars: 0, turns: 0, convs: new Set() };
        }
        return map[key];
    };

    if (files.length === 0) {
        console.log(`未找到对话轨迹文件 (扫描路径: ${path.join(brainDir, '*', '.system_generated', 'logs', 'transcript.jsonl')})`);
    } else {
        for (const fpath of files) {
            const dirParts = fpath.split(path.sep);
            const convId = dirParts[dirParts.length - 4];

            let content = '';
            try {
                content = fs.readFileSync(fpath, 'utf-8');
            } catch {
                continue;
            }

            const lines = content.split(/\r?\n/);
            const steps = [];
            for (const line of lines) {
                if (!line.trim()) continue;
                try {
                    steps.push(JSON.parse(line));
                } catch {
                    // 忽略非合法 JSON 行
                }
            }

            if (steps.length === 0) continue;

            let runningContextLen = 0;
            for (const step of steps) {
                const createdAt = step.created_at || '';
                const source = step.source || '';
                const stepType = step.type || '';
                const contentData = step.content || '';
                const toolCalls = step.tool_calls || [];

                // 精准计算字符数
                let textLen = getExactCharCount(contentData);
                if (Array.isArray(toolCalls) && toolCalls.length > 0) {
                    try {
                        textLen += getExactCharCount(JSON.stringify(toolCalls));
                    } catch {}
                }

                if (source === 'MODEL' || stepType === 'PLANNER_RESPONSE') {
                    const dtStr = createdAt ? createdAt.substring(0, 10) : 'Unknown';
                    const mStr = createdAt ? createdAt.substring(0, 7) : 'Unknown';

                    const dStat = getOrInitStat(dailyStats, dtStr);
                    dStat.input_chars += runningContextLen;
                    dStat.output_chars += textLen;
                    dStat.turns += 1;
                    dStat.convs.add(convId);

                    const mStat = getOrInitStat(monthlyStats, mStr);
                    mStat.input_chars += runningContextLen;
                    mStat.output_chars += textLen;
                    mStat.turns += 1;
                    mStat.convs.add(convId);
                }

                runningContextLen += textLen;
            }
        }
    }

    // 表格列宽配置
    const COL = {
        date: 12,
        conv: 8,
        turns: 10,
        inChar: 14,
        outChar: 14,
        totChar: 14,
        inTok: 14,
        outTok: 14,
        totTok: 14
    };

    const renderHeader = (titleColName) => {
        return [
            padEndStr(titleColName, COL.date),
            padEndStr('对话数', COL.conv),
            padEndStr('交互轮数', COL.turns),
            padStartStr('精准输入字符', COL.inChar),
            padStartStr('精准输出字符', COL.outChar),
            padStartStr('精准总字符', COL.totChar),
            padStartStr('估算输入Tok', COL.inTok),
            padStartStr('估算输出Tok', COL.outTok),
            padStartStr('总估算Token', COL.totTok)
        ].join(' | ');
    };

    const renderRow = (label, convCount, turns, inChar, outChar, inTok, outTok) => {
        const totChar = inChar + outChar;
        const totTok = inTok + outTok;
        return [
            padEndStr(label, COL.date),
            padEndStr(convCount, COL.conv),
            padEndStr(turns, COL.turns),
            padStartStr(formatNum(inChar), COL.inChar),
            padStartStr(formatNum(outChar), COL.outChar),
            padStartStr(formatNum(totChar), COL.totChar),
            padStartStr(formatNum(inTok), COL.inTok),
            padStartStr(formatNum(outTok), COL.outTok),
            padStartStr(formatNum(totTok), COL.totTok)
        ].join(' | ');
    };

    const sampleHeader = renderHeader('月份');
    const tableWidth = getDisplayWidth(sampleHeader);
    const divider = '-'.repeat(tableWidth);

    console.log('\n' + '='.repeat(tableWidth));
    console.log('           Antigravity 实际 Token 与字符消耗统计分析报告 (基于本地 Trace 轨迹)');
    console.log('='.repeat(tableWidth));
    console.log('说明：LLM 每次交互包含多轮上下文递增。统计包含每轮 Prompt 输入字符/Token 与 Response 输出字符/Token。');
    console.log(`换算系数：目前使用 1 Token ≈ ${ratio.toFixed(1)} 字符（中英代码混合场景常用值）\n`);

    console.log('[按月汇总统计]');
    console.log(divider);
    console.log(renderHeader('月份'));
    console.log(divider);

    let totalAllInChar = 0;
    let totalAllOutChar = 0;
    let totalAllInputTok = 0;
    let totalAllOutputTok = 0;

    const sortedMonths = Object.keys(monthlyStats).sort();
    for (const m of sortedMonths) {
        if (filterMonth && m !== filterMonth) continue;
        const s = monthlyStats[m];
        const inTok = Math.floor(s.input_chars / ratio);
        const outTok = Math.floor(s.output_chars / ratio);

        totalAllInChar += s.input_chars;
        totalAllOutChar += s.output_chars;
        totalAllInputTok += inTok;
        totalAllOutputTok += outTok;

        console.log(renderRow(m, s.convs.size, s.turns, s.input_chars, s.output_chars, inTok, outTok));
    }

    console.log(divider);
    console.log(renderRow('累计总量', '-', '-', totalAllInChar, totalAllOutChar, totalAllInputTok, totalAllOutputTok));
    console.log(divider);

    if (showDaily) {
        console.log(`\n[按日明细统计 (近 ${days} 天)]`);
        console.log(divider);
        console.log(renderHeader('日期'));
        console.log(divider);

        const sortedDays = Object.keys(dailyStats).sort();
        const recentDays = sortedDays.slice(-days);

        for (const d of recentDays) {
            if (filterMonth && !d.startsWith(filterMonth)) continue;
            const s = dailyStats[d];
            const inTok = Math.floor(s.input_chars / ratio);
            const outTok = Math.floor(s.output_chars / ratio);

            console.log(renderRow(d, s.convs.size, s.turns, s.input_chars, s.output_chars, inTok, outTok));
        }
        console.log(divider);
    }

    if (saveJson) {
        const jsonPath = path.resolve(process.cwd(), jsonFile);
        syncStatsToJson(dailyStats, jsonPath);

        // 如果生成默认 stats.json，自动触发更新图表与 README
        try {
            const generator = require('./generate.js');
            if (generator && typeof generator.run === 'function') {
                generator.run();
            }
        } catch {
            // 忽略非必须的图表生成错误
        }
    }
}

// 简易 CLI 参数解析
function parseArgs() {
    const rawArgs = process.argv.slice(2);
    const options = {
        ratio: 3.5,
        days: 30,
        filterMonth: null,
        showDaily: true,
        jsonFile: 'stats.json',
        saveJson: true
    };

    for (let i = 0; i < rawArgs.length; i++) {
        const arg = rawArgs[i];
        if (arg === '--ratio' && rawArgs[i + 1]) {
            options.ratio = parseFloat(rawArgs[++i]);
        } else if (arg === '--days' && rawArgs[i + 1]) {
            options.days = parseInt(rawArgs[++i], 10);
        } else if (arg === '--month' && rawArgs[i + 1]) {
            options.filterMonth = rawArgs[++i];
        } else if (arg === '--no-daily') {
            options.showDaily = false;
        } else if ((arg === '--output' || arg === '-o' || arg === '--json') && rawArgs[i + 1]) {
            options.jsonFile = rawArgs[++i];
        } else if (arg === '--no-json') {
            options.saveJson = false;
        } else if (arg === '--help' || arg === '-h') {
            console.log(`
Antigravity Token/Character Consumption Statistics Tool (Node.js Version)

Options:
  --ratio <num>        Character to Token ratio (default: 3.5)
  --days <num>         Number of recent days to show in daily view (default: 30)
  --month <str>        Filter statistics for a specific month (e.g. 2026-08)
  --no-daily           Hide daily breakdown and show only monthly summary
  --output, -o <path>  JSON output file path (default: stats.json)
  --no-json            Do not save/update JSON file
            `);
            process.exit(0);
        }
    }
    return options;
}

const opts = parseArgs();
analyzeTokens(opts);