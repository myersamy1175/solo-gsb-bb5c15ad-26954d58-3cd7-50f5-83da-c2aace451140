'use strict';

/**
 * 装配校准（标记相位回零）算法（精确有理数 / 模同余，基于 BigInt）
 *
 * 已装好的 1～3 级齿轮传动（每级主动 / 从动齿数已知），每根轴上有一个标记，
 * 其相对零位的初始相位为 p/q（0 ≤ p/q < 1，按轴顺序：轴 1 = 输入轴，
 * 轴 2..n+1 = 各级输出轴）。求：输入轴再转**严格正整数圈** N 时，
 * 全部轴的标记**同时回到零位**的最早圈数。
 *
 * 传动关系（外啮合每级反向）：输入轴转 1 圈时，
 *   轴 j+1 的有符号转数 = −(主动齿数_j / 从动齿数_j)，
 * 按齿数连乘得各轴相对输入轴的有符号转数比 R_j（精确分数，负号表示反向）：
 *   R_1 = 1，R_{j+1} = −R_j × 主动齿数_j / 从动齿数_j。
 *
 * 输入轴转 N 圈时轴 j 转 N·R_j 圈，标记回零条件（相位 + 转数 ≡ 0，mod 1）：
 *   N·a_j/b_j + u_j/v_j ≡ 0 (mod 1)
 * 其中 R_j = a_j/b_j、相位 = u_j/v_j（均已约分，分母为正）。化为模同余：
 *   b_j·v_j | N·a_j·v_j + u_j·b_j
 * 必要条件：v_j | u_j·b_j，而 gcd(u_j, v_j)=1，故等价于 **v_j | b_j**
 * （该轴转数的小数部分分母只能整除 b_j，无法抵消分母更“细”的相位）。
 * 条件成立时（令 b_j = v_j·t）同余化为关于 N 的线性同余：
 *   N·a_j ≡ −u_j·t (mod b_j)，gcd(a_j, b_j)=1 有唯一解
 *   ⇒ 每轴给出周期约束 **N ≡ c_j (mod b_j)**（模数即转数比分母）。
 *
 * 多轴合并：各轴模数 b_j 一般**不互素**，用广义中国剩余定理逐对合并——
 *   N ≡ c_i (mod m_i) 与 N ≡ c_j (mod m_j) 相容 ⇔ c_i ≡ c_j (mod gcd(m_i, m_j))，
 * 相容时合并为 N ≡ c (mod lcm(m_i, m_j))；同余组整体有解 ⇔ 两两相容。
 * 全部相容时合并解 N ≡ c (mod m) 的最早严格正整数圈为
 *   N = c mod m（为 0 时取 m 本身，因为 0 圈不算“再转”）。
 *
 * 无解时明确区分两类冲突：
 *   - 自身不可解：某轴相位分母 v_j 不整除转数比分母 b_j，任意整数圈都无法回零；
 *   - 周期不相容：两轴各自的同余约束在模数公约数下余数不一致，无法同时满足。
 */

const { makeFrac, MIN_TEETH, MAX_TEETH } = require('./search');

/** 级数范围 / 相位分母上限（10¹²） */
const MIN_STAGES = 1;
const MAX_STAGES = 3;
const MAX_PHASE_DEN = 1000000000000n;

/* ------------------------------------------------------------------ */
/* 大整数工具                                                          */
/* ------------------------------------------------------------------ */

function gcdBig(a, b) {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b) [a, b] = [b, a % b];
  return a;
}

/** 模逆元：返回 x 使 a·x ≡ 1 (mod m)，要求 gcd(a, m)=1 且 m > 1，结果 0 < x < m */
function modInverse(a, m) {
  let [oldR, r] = [((a % m) + m) % m, m];
  let [oldS, s] = [1n, 0n];
  while (r !== 0n) {
    const q = oldR / r;
    [oldR, r] = [r, oldR - q * r];
    [oldS, s] = [s, oldS - q * s];
  }
  // oldR = gcd = 1，oldS·a ≡ 1 (mod m)
  return ((oldS % m) + m) % m;
}

/**
 * 合并两条相容的同余：N ≡ c1 (mod m1) 与 N ≡ c2 (mod m2)
 * （调用前须保证 c1 ≡ c2 (mod gcd(m1, m2))），
 * 返回 N ≡ c (mod lcm(m1, m2)) 的 (c, m)，0 ≤ c < m。
 */
function crtMerge(c1, m1, c2, m2) {
  const g = gcdBig(m1, m2);
  const m2g = m2 / g;
  let k = 0n;
  if (m2g !== 1n) {
    const t = (((c2 - c1) / g) % m2g + m2g) % m2g;
    const inv = modInverse(m1 / g, m2g);
    k = (t * inv) % m2g;
  }
  const m = m1 * m2g;
  const c = (((c1 + m1 * k) % m) + m) % m;
  return { residue: c, modulus: m };
}

/* ------------------------------------------------------------------ */
/* 输入校验                                                            */
/* ------------------------------------------------------------------ */

/**
 * 解析正整数字段（齿数）：接受 JSON number 或纯数字字符串。
 * @returns {{ok:true,value:number}|{ok:false,error:string}}
 */
function parsePositiveInt(raw, label, max) {
  let v;
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw) || !Number.isInteger(raw)) {
      return { ok: false, error: `${label}需为正整数` };
    }
    v = raw;
  } else if (typeof raw === 'string' && /^\s*\d+\s*$/.test(raw)) {
    v = Number(raw.trim());
  } else {
    return { ok: false, error: `${label}需为正整数` };
  }
  if (v < 1 || v > max) {
    return { ok: false, error: `${label}需为 1～${max} 的正整数` };
  }
  return { ok: true, value: v };
}

/**
 * 解析非负整数字段（相位分子 / 分母）：接受 JSON number 或纯数字字符串，
 * 返回 BigInt（分母最大 10¹²，超出 Number 安全范围的情形也一并拒绝）。
 * @returns {{ok:true,value:bigint}|{ok:false,error:string}}
 */
function parseNonNegativeBigInt(raw, label) {
  let v;
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw) || !Number.isInteger(raw)) {
      return { ok: false, error: `${label}需为整数` };
    }
    v = BigInt(raw);
  } else if (typeof raw === 'string' && /^\s*\+?\d+\s*$/.test(raw)) {
    v = BigInt(raw.trim());
  } else {
    return { ok: false, error: `${label}需为整数` };
  }
  if (v < 0n) return { ok: false, error: `${label}不能为负数` };
  return { ok: true, value: v };
}

/**
 * 校验全部请求参数：1～3 级齿数 + 各轴初始相位（0 ≤ p/q < 1）。
 * @param {*} body
 * @returns {{ok:true,stages:Array,phases:Array}|{ok:false,error:string}}
 */
function validatePhaseResetInput(body) {
  const input = body && typeof body === 'object' ? body : {};

  // ---- 级数与齿数 ----
  if (!Array.isArray(input.stages)) {
    return { ok: false, error: '级列表（stages）格式不正确' };
  }
  if (input.stages.length < MIN_STAGES || input.stages.length > MAX_STAGES) {
    return { ok: false, error: `级数需为 ${MIN_STAGES}～${MAX_STAGES} 级（当前 ${Array.isArray(input.stages) ? input.stages.length : 0} 级）` };
  }
  const stages = [];
  for (let i = 0; i < input.stages.length; i++) {
    const row = input.stages[i];
    if (!row || typeof row !== 'object') {
      return { ok: false, error: `第 ${i + 1} 级数据格式不正确` };
    }
    const drive = parsePositiveInt(row.driveTeeth, `第 ${i + 1} 级主动齿数`, MAX_TEETH);
    if (!drive.ok) return { ok: false, error: drive.error };
    const driven = parsePositiveInt(row.drivenTeeth, `第 ${i + 1} 级从动齿数`, MAX_TEETH);
    if (!driven.ok) return { ok: false, error: driven.error };
    stages.push({ stage: i + 1, driveTeeth: drive.value, drivenTeeth: driven.value });
  }

  // ---- 各轴初始相位（轴数 = 级数 + 1） ----
  const axisCount = stages.length + 1;
  if (!Array.isArray(input.phases)) {
    return { ok: false, error: '相位列表（phases）格式不正确' };
  }
  if (input.phases.length !== axisCount) {
    return {
      ok: false,
      error:
        `相位数量需等于轴数 ${axisCount}（${stages.length} 级传动 = 输入轴 + ${stages.length} 根输出轴），` +
        `当前 ${input.phases.length} 个`,
    };
  }
  const phases = [];
  for (let j = 0; j < axisCount; j++) {
    const row = input.phases[j];
    const label = j === 0 ? '输入轴（轴 1）' : `轴 ${j + 1}`;
    if (!row || typeof row !== 'object') {
      return { ok: false, error: `${label}的相位数据格式不正确` };
    }
    const q = parseNonNegativeBigInt(row.q, `${label}的相位分母 q`);
    if (!q.ok) return { ok: false, error: q.error };
    if (q.value < 1n) return { ok: false, error: `${label}的相位分母 q 需为正整数` };
    if (q.value > MAX_PHASE_DEN) {
      return { ok: false, error: `${label}的相位分母 q 不能超过 10¹²` };
    }
    const p = parseNonNegativeBigInt(row.p, `${label}的相位分子 p`);
    if (!p.ok) return { ok: false, error: p.error };
    if (p.value >= q.value) {
      return {
        ok: false,
        error: `${label}的相位需满足 0 ≤ p/q < 1（当前 p=${p.value}、q=${q.value}，p 须小于 q）`,
      };
    }
    phases.push({ p: p.value, q: q.value, frac: makeFrac(p.value, q.value) });
  }

  return { ok: true, stages, phases };
}

/* ------------------------------------------------------------------ */
/* 主算法                                                              */
/* ------------------------------------------------------------------ */

/**
 * 装配校准主入口。
 *
 * @param {Array<{stage:number,driveTeeth:number,drivenTeeth:number}>} stages 已校验级列表
 * @param {Array<{p:bigint,q:bigint,frac:object}>} phases 已校验各轴相位（长度 = 级数+1）
 */
function phaseReset(stages, phases) {
  const axisCount = stages.length + 1;

  // 各轴相对输入轴的有符号转数比 R_j：R_1 = 1，R_{j+1} = −R_j × 主动/从动（外啮合反向）
  const stageRatios = stages.map((st) =>
    makeFrac(BigInt(st.driveTeeth), BigInt(st.drivenTeeth)));
  const turnRatios = [makeFrac(1n, 1n)];
  for (const r of stageRatios) {
    const prev = turnRatios[turnRatios.length - 1];
    turnRatios.push(makeFrac(-prev.num * r.num, prev.den * r.den));
  }

  // 逐轴把回零条件 N·a/b + u/v ≡ 0 (mod 1) 化为模同余 N ≡ c (mod b)
  const axes = [];
  for (let j = 0; j < axisCount; j++) {
    const axis = j + 1;
    const R = turnRatios[j];
    const a = R.num;
    const b = R.den;
    const u = phases[j].frac.num;
    const v = phases[j].frac.den;
    const role = axis === 1 ? '输入轴' : axis === axisCount ? '输出轴' : '中间轴';
    const base = { axis, role, phase: phases[j], turnRatio: R };

    // 可解 ⇔ v | b（该轴转数小数部分的分母整除 b，无法抵消更“细”的相位）
    if (b % v !== 0n) {
      axes.push({
        ...base,
        selfSolvable: false,
        selfReason:
          `相位分母 v=${v} 不整除该轴转数比的分母 b=${b}：` +
          `整数圈 N 下该轴转数 N×(${a}/${b}) 的小数部分分母必整除 ${b}，` +
          `无法抵消相位 ${u}/${v}，任意正整数圈都不能回到零位`,
      });
      continue;
    }

    // N·a ≡ −u·(b/v) (mod b)，gcd(a,b)=1 ⇒ 唯一解 N ≡ c (mod b)
    const t = b / v;
    let residue = 0n;
    if (b !== 1n) {
      const rhs = ((-u * t) % b + b) % b;
      residue = rhs === 0n ? 0n : (rhs * modInverse(a, b)) % b;
    }
    axes.push({ ...base, selfSolvable: true, modulus: b, residue });
  }

  // 冲突检测：自身不可解 + 可解轴之间的两两周期相容性
  const conflicts = [];
  for (const ax of axes) {
    if (!ax.selfSolvable) {
      conflicts.push({ type: 'self', axes: [ax.axis], reason: ax.selfReason });
    }
  }
  const solvable = axes.filter((ax) => ax.selfSolvable);
  for (let i = 0; i < solvable.length; i++) {
    for (let j = i + 1; j < solvable.length; j++) {
      const A = solvable[i];
      const B = solvable[j];
      const g = gcdBig(A.modulus, B.modulus);
      if (((A.residue - B.residue) % g + g) % g !== 0n) {
        conflicts.push({
          type: 'pair',
          axes: [A.axis, B.axis],
          residueA: A.residue,
          modulusA: A.modulus,
          residueB: B.residue,
          modulusB: B.modulus,
          gcd: g,
          reason:
            `轴 ${A.axis} 要求 N ≡ ${A.residue} (mod ${A.modulus})，` +
            `轴 ${B.axis} 要求 N ≡ ${B.residue} (mod ${B.modulus})：` +
            `两模数的公约数 ${g} 不整除余数差，两个周期约束不相容，无法同时满足`,
        });
      }
    }
  }
  const conflictAxes = [...new Set(conflicts.flatMap((c) => c.axes))].sort((x, y) => x - y);
  const feasible = conflicts.length === 0;

  // 逐步合并（广义中国剩余定理）；即使最终无解也记录合并过程，便于页面展示
  const mergeSteps = [];
  let accResidue = 0n;
  let accModulus = 1n;
  if (conflicts.every((c) => c.type !== 'self')) {
    for (const ax of solvable) {
      const g = gcdBig(accModulus, ax.modulus);
      const compatible = ((ax.residue - accResidue) % g + g) % g === 0n;
      const step = {
        axis: ax.axis,
        axisResidue: ax.residue,
        axisModulus: ax.modulus,
        accResidue,
        accModulus,
        gcd: g,
        compatible,
        newResidue: null,
        newModulus: null,
      };
      if (!compatible) {
        mergeSteps.push(step);
        break;
      }
      const merged = crtMerge(accResidue, accModulus, ax.residue, ax.modulus);
      step.newResidue = merged.residue;
      step.newModulus = merged.modulus;
      mergeSteps.push(step);
      accResidue = merged.residue;
      accModulus = merged.modulus;
    }
  }

  // 结论
  let turns = null;
  let period = null;
  let shaftTurns = null;
  if (feasible) {
    period = accModulus;
    turns = accResidue % accModulus;
    if (turns === 0n) turns = accModulus; // 严格正整数圈：0 圈不算“再转”
    shaftTurns = axes.map((ax, j) => {
      const t = makeFrac(turns * turnRatios[j].num, turnRatios[j].den);
      const ph = phases[j].frac;
      // 回零验证：相位 + 转数必为整数（标记回到零位）
      const phasePlusTurns = makeFrac(ph.num * t.den + t.num * ph.den, ph.den * t.den);
      return {
        axis: ax.axis,
        role: ax.role,
        turns: t,
        direction: t.num < 0n ? 'reverse' : 'forward',
        phasePlusTurns,
      };
    });
  }

  const message = buildMessage({
    feasible,
    axisCount,
    turns,
    period,
    conflicts,
    conflictAxes,
  });

  return {
    stageCount: stages.length,
    axisCount,
    stages,
    stageRatios,
    turnRatios,
    axes,
    feasible,
    turns,
    period,
    shaftTurns,
    mergeSteps,
    conflicts,
    conflictAxes,
    message,
  };
}

function buildMessage({ feasible, axisCount, turns, period, conflicts, conflictAxes }) {
  if (feasible) {
    return (
      `全部 ${axisCount} 根轴的标记可在输入轴再转 ${turns} 圈（严格正整数圈）时首次同时回到零位；` +
      `回零周期为 ${period} 圈（此后每 ${period} 圈重复一次同时回零）。` +
      '各轴有符号转数见下表，逐轴验证“相位 + 转数 = 整数”即标记回零。'
    );
  }
  const selfCount = conflicts.filter((c) => c.type === 'self').length;
  const pairCount = conflicts.length - selfCount;
  const parts = [];
  if (selfCount > 0) {
    parts.push(
      `${selfCount} 根轴的相位分母不整除其转数比分母，任意整数圈都无法单独回零`,
    );
  }
  if (pairCount > 0) {
    parts.push(`${pairCount} 对轴的回零周期约束互不兼容（模同余无公共解）`);
  }
  return (
    `无法同时回零：${parts.join('；')}。` +
    `涉及冲突的轴：${conflictAxes.map((a) => `轴 ${a}`).join('、')}。` +
    '请调整相关轴的初始标记相位（或改变对应级的齿数搭配）后重新计算。'
  );
}

module.exports = {
  MIN_STAGES,
  MAX_STAGES,
  MAX_PHASE_DEN,
  validatePhaseResetInput,
  phaseReset,
};
