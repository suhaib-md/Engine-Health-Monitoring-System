# IgniSense demo script (5 minutes)

**IgniSense — Smart Engine Health Diagnostic · Team Revora**

This follows the review's five-minute script, built around three moments judges remember:

1. a fault they choose themselves, named from the sensors alone
2. a misfire that names its cylinder
3. a sensor fault the system refuses to believe

## Before you start

- Run `start-ignisense.bat` (or `npm run demo`). The app opens at http://localhost:4173.
- Check the fps readout in the 3D view's top-right corner. It should say about 60 fps. If it keeps saying "reduced effects", that is fine. If it is below about 20, reload with `?no3d` at the end of the address.
- Laptop volume up. The engine sound starts only after you click **Sound on**.
- Two ways to run the demo:
  - **Safe:** Test bench → Scenario → **Full demo tour** → Run scenario. It drives every step below by itself. Use **Pause** in the strip to talk, then **Resume**.
  - **Live:** do the clicks yourself as listed. Use this if you want a judge to pick the fault (blind challenge).

Every number below is what the app shows at the stated operating point. Say "demo calibration" whenever you quote one.

---

## 0:00–0:40 · The problem

**Say:** Maintenance on fixed intervals either wastes parts or misses failures. Condition monitoring watches the engine and predicts. IgniSense has two engines: the "real" one, which can develop hidden faults, and a healthy digital twin that only sees the sensor readings. The gap between what the sensors read and what the twin expects is the evidence. The analytics code is not allowed to see the fault; a lint rule enforces that.

## 0:40–1:20 · Cold start

**Click:** Tour step 1 (or Test bench → Start engine, ambient 20 °C, idle).

**Point at:**

- Oil pressure reads about **2.5 bar** at a cold idle. Cold oil is thick.
- The white ghost tick on each gauge is the Twin's expectation. It sits on the needle: measured equals expected.
- The pistons move by the slider-crank equation, **slowed 100×** (labelled on screen). Pistons 1 and 4 move together, 2 and 3 opposite, and the cylinders flash in firing order 1-3-4-2.

**Then:** time-warp 60× (the tour does it). Half an hour of warm-up passes in about half a minute. Pressure settles as the oil thins.

**Click the oil-pressure value:** the math drawer shows the pressure equation with today's numbers in cyan. The white result is the ghost on the gauge; the drawer's check table says **✓ EQUAL**.

## 1:20–2:20 · Blind fault

**Live:** Test bench → **Deal blind challenge**. Ask a judge to pick a card on the Live Twin page. Nobody on screen knows what is on it; the worker shuffled the deck.

**Tour:** the oil pump starts to wear, and keeps wearing.

**Point at:**

1. **Trends → CUSUM** crosses 5 on oil pressure while the pressure still looks acceptable, about 12 simulated seconds after the pump starts to fail. The card says *"Early warning: oil pressure drifting below expectation"*. No rule has tripped yet.
2. The rules follow: WATCH, then WARNING. The card names **Lubrication-system degradation** and lists its evidence ("oil pressure is N % below twin expectation…").
3. The math drawer's last line solves backwards for the pump health that explains the reading. It lands close to the true hidden value.
4. **Blind:** press **Reveal the card**. The strip shows what was on the card and ✓ CORRECT.

## 2:20–3:20 · Misfire

**Click:** Test bench → Fault → Cylinder misfire → C3 → Inject (the tour does it after repairing the pump). Turn **Sound on**.

**Point at:**

- **The sound stumbles:** one exhaust pulse in four goes missing. The sound is built from the *measured* crank speed, not from the hidden fault.
- **Vibration page:** a 0.5× line appears in the crank-speed spectrum. On the polar plot the dot jumps into the **cylinder 3 sector (−45°)**.
- **Torque command:** it rises by **exactly 4/3**. In the app that is about 111 → 148 N·m; the review's rounded numbers are 110 → 146. Three cylinders are now doing four cylinders' work.
- The card names **Cylinder 3 misfire**. In the 3D view, cylinder 3's combustion flash fades once the monitor has named it.

## 3:20–3:50 · Sensor fault

**Click:** Repair, then Test bench → Sensor fault → COOLANT → SPIKE → Inject (the tour does it).

**Point at:** the card says **Coolant sensor fault**: *"Coolant reading jumped +25 °C in 0.10 s (≈ 250 K/s); the energy balance allows at most 0.81 K/s"*. The cooling system is **not** blamed: the other sensors and the Twin agree with each other, and the bad readings are left out of the diagnosis.

**Say:** the fastest the coolant can physically heat is all the coolant heat at full load with zero cooling, 81.5 kW into 100 kJ/K, so 0.8 K/s. The reading beat that by more than 300 times, so the sensor failed, not the engine.

## 3:50–4:30 · Prognosis and report

**Click:** Test bench → Oil-pump wear → onset **Wears on** → Inject. Let it run at 10× for a minute.

**Point at:**

- The health panel shows **RUL ≈ … (low–high) simulated, at the current load**. It appears only when the downward trend is statistically significant.
- Raise the **Load** slider. Wear speeds up under load, so the RUL shrinks.
- **Report → Print / save PDF:** a one-page maintenance report with the fault, evidence, action, RUL band and exposure counters.

## 4:30–5:00 · Hardware path

**Say:** every source emits the same telemetry object. An ESP32 with cheap sensors (DS18B20, MAX31855, a pressure transducer, an ADXL345) or a USB OBD-II adapter only needs one adapter file; the analytics do not change. The next step is a heat-balance run on the college engine test rig to replace the demo calibration with measured data.

---

## Likely judge questions

| Question | Answer |
| --- | --- |
| Isn't the AI just reading the fault you injected? | No. The analytics only receive telemetry; the fault state lives in a separate module they cannot import (a lint rule enforces it). The blind challenge you just ran proves it. |
| How accurate is the model? | It is a reduced-order model with demo calibration, checked against hand calculations on the Validation page (all green). Absolute accuracy needs real-engine calibration: a heat-balance test on the lab rig. |
| Why not deep learning? | There is no real failure data. A network trained on our simulator would learn our own equations back. The statistics we use have a known false-alarm rate; machine learning becomes useful once real data is logged. |
| What is your false-alarm rate? | D²'s limit is the χ² 99 % point (15.09 for 5 signals), so about 1 healthy sample in 100 crosses it. An alarm needs 3 s of persistence, which cuts that sharply. In our tests a healthy engine never raised a held alarm. |
| Why does an inline-4 shake at twice crank speed? | The first-order piston forces cancel between cylinder pairs; the second-order forces (λ cos 2θ) add. That is 2,517 N peak at 3,000 rpm in our engine. |
| How do you know which cylinder misfired? | From the phase of the half-order crank-speed component. The cylinders fire 180° of crank apart, which is 90° at half order: +45°, +135°, −45°, −135°. |
| Why exactly 4/3? | The speed governor holds the speed, so the mean torque must still match the load. With one cylinder out, three pulses carry four pulses' worth: 4·T/3. |
| How can you tell a sensor spike from real overheating? | Physics: the engine cannot heat faster than about 0.8 K/s, and a real rise would warm the oil through the water jacket. A slow drift is caught by that oil cross-check. |
| Is the RUL real? | It is a trend estimate: a straight-line fit with a ±2 standard-error band, shown only when the slope is significant, and conditional on the current load. It is labelled simulated time. |

## If something goes wrong

| Symptom | Recovery |
| --- | --- |
| The 3D view stutters | Keep going; the numbers are unaffected. Or reload with `?no3d`. |
| A step is taking too long | Test bench → Time-warp 60×, or press **Restart** on the scenario strip. |
| Wrong fault still active | Test bench → **Repair**. Alerts clear after their hold time (about 20 s per level). |
| Lost track of state | Reload the page. The simulation restarts from a cold engine with the same seed. |
