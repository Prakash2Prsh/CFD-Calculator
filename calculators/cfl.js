/* ==========================================================
   CFL & TRANSIENT TIME STEP CALCULATOR
   Line-for-line port of the supplied Python script.
   ========================================================== */

const Cfl = (() => {

  const GAMMA = 1.4;
  const R_GAS = 287.05;

  /**
   * calculate_velocity(T0, M)
   */
  function calculateVelocity(T0, M) {
    const T = T0 / (1.0 + 0.5 * (GAMMA - 1.0) * M ** 2);
    const a = Math.sqrt(GAMMA * R_GAS * T);
    const U = M * a;
    return U;
  }

  /**
   * Full solve, mirroring main() in the Python script.
   * inputs: { P0, T0, M, CFL, dx, L, res_times }
   */
  function run(inputs) {
    const { P0, T0, M, CFL, dx, L, res_times } = inputs;

    const U = calculateVelocity(T0, M);
    const delta_t = (CFL * dx) / U;
    const t_residence = L / U;
    const t_total = t_residence * res_times;
    const total_steps = Math.ceil(t_total / delta_t);

    return { P0, T0, M, U, dx, CFL, delta_t, t_residence, res_times, t_total, total_steps };
  }

  return { calculateVelocity, run };
})();

/* ---------------------------------------------------------
   UI WIRING
--------------------------------------------------------- */
function initCflCalc() {
  const ids = ['c-P0', 'c-T0', 'c-M', 'c-CFL', 'c-dx', 'c-L', 'c-res'];

  function compute() {
    const P0 = readNumber('c-P0');
    const T0 = readNumber('c-T0');
    const M = readNumber('c-M');
    const CFL = readNumber('c-CFL');
    const dx = readNumber('c-dx');
    const L = readNumber('c-L');
    const res_times = readNumber('c-res');

    if ([P0, T0, M, CFL, dx, L, res_times].some(v => v === null)) {
      renderEmpty('c-output', 'Fill in every field to compute the time step.');
      return;
    }

    try {
      const r = Cfl.run({ P0, T0, M, CFL, dx, L, res_times });
      renderCflResults(r);
    } catch (e) {
      renderEmpty('c-output', e.message, true);
    }
  }

  function renderCflResults(r) {
    const panel = document.getElementById('c-output');
    panel.innerHTML = `
      <div class="result-group">
        <div class="result-group-title">Flow &amp; mesh</div>
        <div class="result-row"><span class="rk">Freestream velocity (U)</span><span class="rv">${Fmt.fixed(r.U, 4)} m/s</span></div>
        <div class="result-row"><span class="rk">Minimum cell length (dx)</span><span class="rv">${Fmt.g(r.dx)} m</span></div>
        <div class="result-row"><span class="rk">Target Courant no. (CFL)</span><span class="rv">${Fmt.g(r.CFL)}</span></div>
      </div>
      <div class="result-group">
        <div class="result-group-title">Time step</div>
        <div class="result-row hero"><span class="rk">Calculated time step (dt)</span><span class="rv">${Fmt.g(r.delta_t)} s</span></div>
      </div>
      <div class="result-group">
        <div class="result-group-title">Simulation length</div>
        <div class="result-row"><span class="rk">1 residence time</span><span class="rv">${Fmt.fixed(r.t_residence, 6)} s</span></div>
        <div class="result-row"><span class="rk">Target residence times</span><span class="rv">${Fmt.g(r.res_times)}</span></div>
        <div class="result-row"><span class="rk">Total flow time</span><span class="rv">${Fmt.fixed(r.t_total, 6)} s</span></div>
        <div class="result-row hero"><span class="rk">Total time steps required</span><span class="rv">${Fmt.commas(r.total_steps)}</span></div>
      </div>
      <div class="note info">${infoIcon()}<span>Stagnation pressure P₀ is captured for flow-condition record-keeping but does not enter the time-step calculation itself — the Python reference script reads it but does not use it downstream.</span></div>
    `;
  }

  document.getElementById('c-calc-btn').addEventListener('click', compute);
  bindReset('c-reset-btn', ids, () => renderEmpty('c-output', 'Enter parameters and calculate to see timing results.'));
  bindCopy('c-copy-btn', 'c-output');
  renderEmpty('c-output', 'Enter parameters and calculate to see timing results.');
}

window.initCflCalc = initCflCalc;
