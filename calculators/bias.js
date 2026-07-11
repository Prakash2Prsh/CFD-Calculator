/* ==========================================================
   BIAS FACTOR / MESH BIAS CALCULATOR
   Line-for-line port of the supplied Python script.
   Physics, equations, tolerances and iteration counts are
   preserved exactly — do not "optimize" the numerics here.
   ========================================================== */

const Bias = (() => {

  // ---- constants (identical to Python) ----
  const GAMMA = 1.4;
  const R_GAS = 287.05;
  const MU_REF = 1.716e-5;
  const T_REF = 273.15;
  const SUTH_S = 110.4;

  /**
   * calculate_physics(P0, T0, M, L, y_plus, tau_w)
   * Mirrors the Python function exactly.
   */
  function calculatePhysics(P0, T0, M, L, y_plus, tau_w) {
    const T = T0 / (1.0 + 0.5 * (GAMMA - 1.0) * M ** 2);
    const P = P0 / ((1.0 + 0.5 * (GAMMA - 1.0) * M ** 2) ** (GAMMA / (GAMMA - 1.0)));
    const rho = P / (R_GAS * T);
    const a = Math.sqrt(GAMMA * R_GAS * T);
    const U = M * a;
    const mu = MU_REF * ((T / T_REF) ** 1.5) * ((T_REF + SUTH_S) / (T + SUTH_S));
    const Re = (rho * U * L) / mu;

    // Reverse-calculate Cf from Fluent's tau_w
    const Cf = tau_w / (0.5 * rho * (U ** 2));
    const U_tau = Math.sqrt(tau_w / rho);

    // First cell thickness
    const delta_y = (y_plus * mu) / (rho * U_tau);

    return { T, P, rho, mu, U, Re, Cf, tau_w, U_tau, delta_y };
  }

  /**
   * calculate_bias(first_cell, N, L, symmetric, tol, max_iter)
   * Bisection solve for growth rate r — identical bracketing / loop logic to Python.
   */
  function calculateBias(first_cell, N, L, symmetric = false, tol = 1e-12, max_iter = 1000) {
    if (Math.abs(first_cell * N - L) < tol) return 1.0;

    function f(r) {
      if (!symmetric) {
        return first_cell * (1 - r ** N) / (1 - r) - L;
      } else {
        const M_div = Math.floor(N / 2);
        if (N % 2 === 0) {
          return 2 * first_cell * (1 - r ** M_div) / (1 - r) - L;
        } else {
          return 2 * first_cell * (1 - r ** M_div) / (1 - r) + first_cell * (r ** M_div) - L;
        }
      }
    }

    let r_low, r_high;
    if (first_cell * N < L) {
      r_low = 1.0001;
      r_high = 2.0;
      while (f(r_high) < 0) r_high *= 2.0;
    } else {
      r_low = 0.0001;
      r_high = 0.9999;
    }

    let r_mid = (r_low + r_high) / 2.0;
    for (let i = 0; i < max_iter; i++) {
      r_mid = (r_low + r_high) / 2.0;
      const f_mid = f(r_mid);
      if (Math.abs(f_mid) < tol) return r_mid;
      if (f(r_low) * f_mid < 0) {
        r_high = r_mid;
      } else {
        r_low = r_mid;
      }
    }
    return r_mid;
  }

  /**
   * calculate_N_from_r(first_cell, r, L, symmetric)
   */
  function calculateNFromR(first_cell, r, L, symmetric = false) {
    if (r === 1.0) return Math.round(L / first_cell);

    if (!symmetric) {
      const term = 1 - (L * (1 - r)) / first_cell;
      if (term <= 0) throw new Error("Target growth rate 'r' is too small to reach the domain length.");
      const N_exact = Math.log(term) / Math.log(r);
      return Math.round(N_exact);
    } else {
      const term = 1 - ((L / 2.0) * (1 - r)) / first_cell;
      if (term <= 0) throw new Error("Target growth rate 'r' is too small to reach the domain length.");
      const M_exact = Math.log(term) / Math.log(r);
      return Math.round(M_exact * 2);
    }
  }

  /**
   * format_e3(val) -> "[number]e-3 m", number formatted like Python's %g
   */
  function formatE3(val) {
    return `${Fmt.g(val * 1000)}e-3 m`;
  }

  /**
   * Full solve, mirroring main() in the Python script.
   * inputs: { P0, T0, M, tau_w, y_plus, L, symmetric, mode, N, r_target }
   */
  function run(inputs) {
    const { P0, T0, M, tau_w, y_plus, L, symmetric, mode } = inputs;

    // Physics first (L is a dummy 1.0 here, exactly as in the Python script)
    const physics = calculatePhysics(P0, T0, M, 1.0, y_plus, tau_w);
    const first_cell = physics.delta_y;

    let N, r, r_target_used = null, r_adjust_note = null;

    if (mode === 1) {
      N = Math.trunc(inputs.N);
      if (!Number.isFinite(N) || N < 1) throw new Error('Number of divisions must be a positive integer.');
      r = calculateBias(first_cell, N, L, symmetric);
    } else if (mode === 2) {
      const r_target = inputs.r_target;
      N = calculateNFromR(first_cell, r_target, L, symmetric);
      if (N < 1) throw new Error('Target growth rate produces fewer than 1 division — increase r or domain length.');
      r = calculateBias(first_cell, N, L, symmetric);
      r_target_used = r_target;
      r_adjust_note = `Calculated ${N} divisions. Growth rate adjusted from ${r_target} to ${Fmt.fixed(r, 6)} to perfectly fit the domain length.`;
    } else {
      throw new Error('Invalid mode selected.');
    }

    let last_cell, last_label;
    if (!symmetric) {
      last_cell = first_cell * (r ** (N - 1));
      last_label = 'Last (Max) cell thickness';
    } else {
      if (N % 2 === 0) {
        last_cell = first_cell * (r ** ((Math.floor(N / 2)) - 1));
      } else {
        last_cell = first_cell * (r ** Math.floor(N / 2));
      }
      last_label = 'Center (Max) cell thickness';
    }

    const bias_factor = last_cell / first_cell;

    return {
      physics, first_cell, N, r, last_cell, last_label, bias_factor,
      y_plus, symmetric, mode, r_adjust_note
    };
  }

  return { calculatePhysics, calculateBias, calculateNFromR, formatE3, run };
})();

/* ---------------------------------------------------------
   UI WIRING
--------------------------------------------------------- */
function initBiasCalc() {
  const ids = ['b-P0', 'b-T0', 'b-M', 'b-tauw', 'b-yplus', 'b-L', 'b-N', 'b-rtarget'];

  function updateModeVisibility() {
    const mode = segValue('b-mode-seg');
    document.getElementById('b-field-N').style.display = mode === '1' ? '' : 'none';
    document.getElementById('b-field-r').style.display = mode === '2' ? '' : 'none';
  }
  bindSeg('b-mode-seg', updateModeVisibility);
  updateModeVisibility();

  bindSwitch('b-sym-switch', () => {});

  function compute() {
    const P0 = readNumber('b-P0');
    const T0 = readNumber('b-T0');
    const M = readNumber('b-M');
    const tau_w = readNumber('b-tauw');
    const y_plus = readNumber('b-yplus');
    const L = readNumber('b-L');
    const mode = parseInt(segValue('b-mode-seg'), 10);
    let N = null, r_target = null;
    if (mode === 1) N = readNumber('b-N'); else r_target = readNumber('b-rtarget');

    if ([P0, T0, M, tau_w, y_plus, L].some(v => v === null) || (mode === 1 && N === null) || (mode === 2 && r_target === null)) {
      renderEmpty('b-output', 'Fill in every field to run the solver.');
      return;
    }

    const symmetric = switchOn('b-sym-switch');

    try {
      const res = Bias.run({ P0, T0, M, tau_w, y_plus, L, symmetric, mode, N, r_target });
      renderBiasResults(res);
    } catch (e) {
      renderEmpty('b-output', e.message, true);
    }
  }

  function renderBiasResults(res) {
    const p = res.physics;
    const panel = document.getElementById('b-output');
    panel.innerHTML = `
      <div class="result-group">
        <div class="result-group-title">Fluid properties (static)</div>
        <div class="result-row"><span class="rk">Static pressure</span><span class="rv">${Fmt.fixed(p.P, 2)} Pa</span></div>
        <div class="result-row"><span class="rk">Static temperature</span><span class="rv">${Fmt.fixed(p.T, 2)} K</span></div>
        <div class="result-row"><span class="rk">Freestream density (ρ)</span><span class="rv">${Fmt.fixed(p.rho, 6)} kg/m³</span></div>
        <div class="result-row"><span class="rk">Freestream velocity (U)</span><span class="rv">${Fmt.fixed(p.U, 4)} m/s</span></div>
        <div class="result-row"><span class="rk">Dynamic viscosity (Sutherland)</span><span class="rv">${Fmt.g(p.mu)} kg/(m·s)</span></div>
        <div class="result-row"><span class="rk">Reynolds number (L = 1 m ref.)</span><span class="rv">${Fmt.g(p.Re)}</span></div>
      </div>
      <div class="result-group">
        <div class="result-group-title">Boundary layer parameters</div>
        <div class="result-row"><span class="rk">Wall shear stress (τ_w)</span><span class="rv">${Fmt.fixed(p.tau_w, 6)} Pa</span></div>
        <div class="result-row"><span class="rk">Skin friction coeff. (C_f)</span><span class="rv">${Fmt.fixed(p.Cf, 6)}</span></div>
        <div class="result-row"><span class="rk">Friction velocity (U_τ)</span><span class="rv">${Fmt.fixed(p.U_tau, 4)} m/s</span></div>
      </div>
      <div class="result-group">
        <div class="result-group-title">Mesh results</div>
        <div class="result-row"><span class="rk">Target Y+</span><span class="rv">${Fmt.g(res.y_plus)}</span></div>
        <div class="result-row"><span class="rk">Divisions (N)</span><span class="rv">${res.N}</span></div>
        <div class="result-row hero"><span class="rk">Growth rate (r)</span><span class="rv">${Fmt.fixed(res.r, 6)}</span></div>
        <div class="result-row"><span class="rk">Bias factor (max / min)</span><span class="rv">${Fmt.g(res.bias_factor)}</span></div>
        <div class="result-row hero"><span class="rk">First cell (dy)</span><span class="rv">${Bias.formatE3(res.first_cell)}</span></div>
        <div class="result-row"><span class="rk">${res.last_label}</span><span class="rv">${Bias.formatE3(res.last_cell)}</span></div>
      </div>
      ${res.r_adjust_note ? `<div class="note info">${infoIcon()}<span>${res.r_adjust_note}</span></div>` : ''}
    `;
  }

  document.getElementById('b-calc-btn').addEventListener('click', compute);
  bindReset('b-reset-btn', ids, () => { updateModeVisibility(); renderEmpty('b-output', 'Enter parameters and run the solver to see mesh results.'); });
  bindCopy('b-copy-btn', 'b-output');
  renderEmpty('b-output', 'Enter parameters and run the solver to see mesh results.');
}

window.initBiasCalc = initBiasCalc;
