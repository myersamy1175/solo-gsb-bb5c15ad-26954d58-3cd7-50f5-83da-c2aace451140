'use strict';

const MIN_STAGES = 1;
const MAX_STAGES = 3;

const stageRowsBox = document.getElementById('stage-rows');
const phaseRowsBox = document.getElementById('phase-rows');
const form = document.getElementById('phase-form');
const formError = document.getElementById('form-error');
const resultPanel = document.getElementById('result-panel');
const resultSummary = document.getElementById('result-summary');
const verdictAlert = document.getElementById('verdict-alert');
const resultDetail = document.getElementById('result-detail');

const EXAMPLE_STAGES = [
  { driveTeeth: 20, drivenTeeth: 40 },
  { driveTeeth: 24, drivenTeeth: 36 },
];
const EXAMPLE_PHASES = [
  { p: 0, q: 1 },
  { p: 1, q: 2 },
  { p: 1, q: 3 },
];

function el(tag, className, html) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

/* ---------------- 级行 ---------------- */

function addStageRow(driveTeeth = '', drivenTeeth = '') {
  const row = el('div', 'stage-row');
  row.innerHTML = `
    <span class="stage-index"></span>
    <input class="stage-drive-input" type="number" min="1" max="100000" step="1" placeholder="主动齿数" value="${driveTeeth}" />
    <input class="stage-driven-input" type="number" min="1" max="100000" step="1" placeholder="从动齿数" value="${drivenTeeth}" />
    <button type="button" class="btn danger-ghost" title="删除该级">✕</button>`;
  row.querySelector('button').addEventListener('click', () => {
    if (stageRowsBox.querySelectorAll('.stage-row').length <= MIN_STAGES) {
      alert(`至少保留 ${MIN_STAGES} 级`);
      return;
    }
    row.remove();
    refreshStageIndex();
  });
  stageRowsBox.appendChild(row);
  refreshStageIndex();
}

function refreshStageIndex() {
  const rows = [...stageRowsBox.querySelectorAll('.stage-row')];
  rows.forEach((r, i) => {
    r.querySelector('.stage-index').textContent = `第 ${i + 1} 级（轴 ${i + 1} → 轴 ${i + 2}）`;
  });
  syncPhaseRows(rows.length + 1);
}

document.getElementById('btn-stage-add').addEventListener('click', () => {
  if (stageRowsBox.querySelectorAll('.stage-row').length >= MAX_STAGES) {
    alert(`最多 ${MAX_STAGES} 级`);
    return;
  }
  addStageRow();
});

/* ---------------- 相位行（轴数 = 级数 + 1，自动增减并保留已填值） ---------------- */

function addPhaseRow(p = '', q = '') {
  const row = el('div', 'phase-row');
  row.innerHTML = `
    <span class="phase-axis"></span>
    <input class="phase-p-input" type="text" inputmode="numeric" placeholder="分子 p（≥0）" value="${p}" />
    <input class="phase-q-input" type="text" inputmode="numeric" placeholder="分母 q（≥1）" value="${q}" />`;
  phaseRowsBox.appendChild(row);
}

function syncPhaseRows(axisCount) {
  let rows = phaseRowsBox.querySelectorAll('.phase-row').length;
  while (rows < axisCount) {
    addPhaseRow();
    rows++;
  }
  while (rows > axisCount) {
    phaseRowsBox.lastElementChild.remove();
    rows--;
  }
  [...phaseRowsBox.querySelectorAll('.phase-row')].forEach((r, i) => {
    const label = i === 0 ? '输入轴' : i === axisCount - 1 ? '输出轴' : '中间轴';
    r.querySelector('.phase-axis').textContent = `轴 ${i + 1}（${label}）`;
  });
}

document.getElementById('btn-example').addEventListener('click', () => {
  stageRowsBox.innerHTML = '';
  phaseRowsBox.innerHTML = '';
  EXAMPLE_STAGES.forEach((s) => addStageRow(s.driveTeeth, s.drivenTeeth));
  [...phaseRowsBox.querySelectorAll('.phase-row')].forEach((r, i) => {
    r.querySelector('.phase-p-input').value = EXAMPLE_PHASES[i]?.p ?? '';
    r.querySelector('.phase-q-input').value = EXAMPLE_PHASES[i]?.q ?? '';
  });
});

/* 初始：示例数据 */
EXAMPLE_STAGES.forEach((s) => addStageRow(s.driveTeeth, s.drivenTeeth));
[...phaseRowsBox.querySelectorAll('.phase-row')].forEach((r, i) => {
  r.querySelector('.phase-p-input').value = EXAMPLE_PHASES[i]?.p ?? '';
  r.querySelector('.phase-q-input').value = EXAMPLE_PHASES[i]?.q ?? '';
});

/* ---------------- 采集与校验 ---------------- */

function collectStages() {
  const stages = [];
  const rows = [...stageRowsBox.querySelectorAll('.stage-row')];
  if (rows.length < MIN_STAGES || rows.length > MAX_STAGES) {
    throw new Error(`级数需为 ${MIN_STAGES}～${MAX_STAGES} 级`);
  }
  rows.forEach((row, i) => {
    const drive = Number(row.querySelector('.stage-drive-input').value.trim());
    const driven = Number(row.querySelector('.stage-driven-input').value.trim());
    if (!Number.isInteger(drive) || drive < 1) {
      throw new Error(`第 ${i + 1} 级主动齿数需为正整数`);
    }
    if (!Number.isInteger(driven) || driven < 1) {
      throw new Error(`第 ${i + 1} 级从动齿数需为正整数`);
    }
    stages.push({ driveTeeth: drive, drivenTeeth: driven });
  });
  return stages;
}

function collectPhases(axisCount) {
  const rows = [...phaseRowsBox.querySelectorAll('.phase-row')];
  if (rows.length !== axisCount) {
    throw new Error(`相位数量需等于轴数 ${axisCount}（当前 ${rows.length} 个）`);
  }
  return rows.map((row, i) => {
    const label = i === 0 ? '输入轴（轴 1）' : `轴 ${i + 1}`;
    const pRaw = row.querySelector('.phase-p-input').value.trim();
    const qRaw = row.querySelector('.phase-q-input').value.trim();
    if (!pRaw) throw new Error(`${label}缺少相位分子 p（相位为 0 时填 0）`);
    if (!qRaw) throw new Error(`${label}缺少相位分母 q（相位为 0 时填 1）`);
    if (!/^\+?\d+$/.test(pRaw)) throw new Error(`${label}的相位分子 p 需为非负整数（当前 ${pRaw}）`);
    if (!/^\+?\d+$/.test(qRaw)) throw new Error(`${label}的相位分母 q 需为正整数（当前 ${qRaw}）`);
    const p = BigInt(pRaw);
    const q = BigInt(qRaw);
    if (q < 1n) throw new Error(`${label}的相位分母 q 需为正整数`);
    if (p >= q) throw new Error(`${label}的相位需满足 0 ≤ p/q < 1（当前 p=${pRaw}、q=${qRaw}，p 须小于 q）`);
    return { p: pRaw, q: qRaw };
  });
}

/* ---------------- 结果渲染 ---------------- */

function fracText(f) {
  return `${f.num}/${f.den} ≈ ${f.decimal}`;
}

function signedFracText(f) {
  return f.num.startsWith('-') ? fracText(f) : `+${fracText(f)}`;
}

function directionText(dir) {
  return dir === 'reverse'
    ? '<span class="diag-bad">反向</span>'
    : '<span class="diag-ok">正向</span>';
}

/** 各轴有符号转数比推导表：逐级速比（外啮合反向）+ 累积转数比 */
function renderRatioTable(data) {
  const wrap = el('div');
  wrap.appendChild(el('h3', 'block-title', '① 各轴有符号转数比（外啮合每级反向，按齿数连乘）'));
  const table = el('table', 'pairs');
  table.innerHTML = `
    <thead><tr>
      <th>级 / 轴</th><th>主动齿</th><th>从动齿</th><th>本级速比（主动/从动）</th>
      <th>该轴相对输入轴<br/>有符号转数比 R</th><th>转向</th>
    </tr></thead>`;
  const tbody = el('tbody');
  data.stages.forEach((st, i) => {
    const ax = data.axes[i + 1];
    const tr = el('tr');
    tr.innerHTML = `
      <td>第 ${st.stage} 级<div class="torque-rated">轴 ${st.stage} → 轴 ${st.stage + 1}</div></td>
      <td>${st.driveTeeth}</td>
      <td>${st.drivenTeeth}</td>
      <td class="frac">${fracText(st.stageRatio)}</td>
      <td class="frac">轴 ${st.stage + 1}：${signedFracText(ax.turnRatio)}</td>
      <td>${directionText(ax.turnRatio.num.startsWith('-') ? 'reverse' : 'forward')}</td>`;
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  wrap.appendChild(table);
  return wrap;
}

/** 逐轴模同余表：回零条件 → N ≡ c (mod b) 或不可解原因 */
function renderCongruenceTable(data) {
  const wrap = el('div');
  wrap.appendChild(el('h3', 'block-title', '② 逐轴回零条件化为模同余（N·a/b + u/v ≡ 0，mod 1）'));
  const table = el('table', 'pairs');
  table.innerHTML = `
    <thead><tr>
      <th>轴</th><th>初始相位 p/q<br/>（约分 u/v）</th><th>转数比 a/b</th>
      <th>回零同余</th><th>判定</th>
    </tr></thead>`;
  const tbody = el('tbody');
  data.axes.forEach((ax) => {
    const tr = el('tr');
    const a = ax.turnRatio.num;
    const b = ax.turnRatio.den;
    const u = ax.phase.reduced.num;
    const v = ax.phase.reduced.den;
    let resultCell;
    let verdictCell;
    if (ax.selfSolvable) {
      resultCell = `<span class="frac">N ≡ ${ax.congruence.residue} (mod ${ax.congruence.modulus})</span>`;
      verdictCell = `<span class="diag-ok">可解（v=${v} 整除 b=${b}）</span>`;
    } else {
      resultCell = `<span class="diag-bad">无整数圈解</span><div class="torque-rated">${ax.selfReason}</div>`;
      verdictCell = '<span class="diag-tag diag-tag-out">自身不可解</span>';
    }
    tr.innerHTML = `
      <td>轴 ${ax.axis}<div class="torque-rated">${ax.role}</div></td>
      <td class="frac">${ax.phase.p}/${ax.phase.q}<div class="torque-rated">= ${u}/${v}</div></td>
      <td class="frac">${a}/${b}</td>
      <td>${resultCell}</td>
      <td>${verdictCell}</td>`;
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  wrap.appendChild(table);
  return wrap;
}

/** 周期合并过程表（广义中国剩余定理逐步合并） */
function renderMergeTable(data) {
  const wrap = el('div');
  wrap.appendChild(el('h3', 'block-title', '③ 非互素周期合并（广义中国剩余定理，逐步并入各轴约束）'));
  if (data.mergeSteps.length === 0) {
    wrap.appendChild(el('p', 'muted', '存在自身不可解的轴，未进入周期合并。'));
    return wrap;
  }
  const table = el('table', 'pairs');
  table.innerHTML = `
    <thead><tr>
      <th>步骤</th><th>已合并约束</th><th>并入轴约束</th><th>模数公约数</th>
      <th>相容性</th><th>合并结果</th>
    </tr></thead>`;
  const tbody = el('tbody');
  data.mergeSteps.forEach((s, i) => {
    const tr = el('tr');
    const compat = s.compatible
      ? '<span class="diag-ok">相容</span>'
      : '<span class="diag-bad">不相容（合并终止）</span>';
    const merged = s.compatible
      ? `<span class="frac">N ≡ ${s.newResidue} (mod ${s.newModulus})</span>`
      : '<span class="diag-bad">—</span>';
    tr.innerHTML = `
      <td>第 ${i + 1} 步</td>
      <td class="frac">N ≡ ${s.accResidue} (mod ${s.accModulus})</td>
      <td class="frac">轴 ${s.axis}：N ≡ ${s.axisResidue} (mod ${s.axisModulus})</td>
      <td class="frac">${s.gcd}</td>
      <td>${compat}</td>
      <td>${merged}</td>`;
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  wrap.appendChild(table);
  return wrap;
}

/** 冲突列表（无解时） */
function renderConflicts(data) {
  const wrap = el('div');
  wrap.appendChild(el('h3', 'block-title', '④ 冲突轴明细（无法同时回零）'));
  const table = el('table', 'pairs');
  table.innerHTML = `
    <thead><tr><th>类型</th><th>涉及轴</th><th>原因</th></tr></thead>`;
  const tbody = el('tbody');
  data.conflicts.forEach((c) => {
    const tr = el('tr');
    const type = c.type === 'self' ? '自身不可解' : '周期不相容';
    tr.innerHTML = `
      <td><span class="diag-tag diag-tag-out">${type}</span></td>
      <td>${c.axes.map((a) => `轴 ${a}`).join('、')}</td>
      <td style="text-align:left">${c.reason}</td>`;
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  wrap.appendChild(table);
  return wrap;
}

/** 结论表（有解时）：最早圈数 + 各轴转数 + 回零验证 */
function renderResultTable(data) {
  const wrap = el('div');
  wrap.appendChild(el('h3', 'block-title', '④ 结论：最早圈数与各轴转数'));

  const head = el('p', 'phase-conclusion');
  head.innerHTML =
    `输入轴再转 <strong class="frac">${data.turns}</strong> 圈（严格正整数圈）时全部标记首次同时回零；` +
    `回零周期 <strong class="frac">${data.period}</strong> 圈。`;
  wrap.appendChild(head);

  const table = el('table', 'pairs');
  table.innerHTML = `
    <thead><tr>
      <th>轴</th><th>有符号转数<br/>（分数 + 小数）</th><th>转向</th>
      <th>回零验证<br/>相位 + 转数（须为整数）</th>
    </tr></thead>`;
  const tbody = el('tbody');
  data.shaftTurns.forEach((st) => {
    const tr = el('tr');
    tr.innerHTML = `
      <td>轴 ${st.axis}<div class="torque-rated">${st.role}</div></td>
      <td class="frac">${signedFracText(st.turns)}</td>
      <td>${directionText(st.direction)}</td>
      <td class="frac">${st.phasePlusTurns.num}/${st.phasePlusTurns.den} <span class="diag-ok">✓ 整数，回到零位</span></td>`;
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  wrap.appendChild(table);
  return wrap;
}

/* ---------------- 提交 ---------------- */

form.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  formError.hidden = true;
  resultPanel.hidden = true;

  let payload;
  try {
    const stages = collectStages();
    payload = { stages, phases: collectPhases(stages.length + 1) };
  } catch (e) {
    formError.textContent = e.message;
    formError.hidden = false;
    return;
  }

  try {
    const resp = await fetch('/api/phase-reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || '校准计算失败');

    resultPanel.hidden = false;
    resultDetail.innerHTML = '';

    resultSummary.textContent =
      `${data.stageCount} 级传动 / ${data.axisCount} 根轴` +
      (data.feasible ? ` · 最早 ${data.turns} 圈同时回零` : ' · 无法同时回零');

    verdictAlert.hidden = false;
    verdictAlert.className = `alert ${data.feasible ? 'ok' : 'error'}`;
    verdictAlert.innerHTML =
      `<strong>${data.feasible ? '可同时回零' : '无法同时回零'}：</strong>${data.message}`;

    resultDetail.appendChild(renderRatioTable(data));
    resultDetail.appendChild(renderCongruenceTable(data));
    resultDetail.appendChild(renderMergeTable(data));
    if (data.feasible) {
      resultDetail.appendChild(renderResultTable(data));
    } else {
      resultDetail.appendChild(renderConflicts(data));
    }
  } catch (e) {
    resultPanel.hidden = false;
    resultDetail.innerHTML = '';
    resultSummary.textContent = '';
    verdictAlert.hidden = false;
    verdictAlert.className = 'alert error';
    verdictAlert.textContent = `请求出错：${e.message}`;
  }
});
