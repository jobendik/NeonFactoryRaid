import { Balance } from '../config/Balance';
import { bus, Events } from '../core/EventBus';

// GreedSystem per blueprint §7.3. Starts ticking the moment the extraction pad
// opens; the multiplier reads off Balance.raid.greedSteps as a step function of
// seconds-since-open. The multiplier composes on top of combo (which already
// scales pickup value during the raid): combo is "did you chain kills?" and
// greed is "did you gamble by staying late?". Both apply at extract time.

export class GreedSystem {
  private elapsed = 0;
  private running = false;
  private lastEmittedMult = 1.0;

  start(): void {
    this.elapsed = 0;
    this.running = true;
    this.lastEmittedMult = 1.0;
  }

  stop(): void {
    this.running = false;
  }

  reset(): void {
    this.elapsed = 0;
    this.running = false;
    this.lastEmittedMult = 1.0;
  }

  update(dt: number): void {
    if (!this.running) return;
    this.elapsed += dt;
    const mult = this.computeMultiplier();
    if (mult !== this.lastEmittedMult) {
      this.lastEmittedMult = mult;
      bus.emit(Events.GREED_CHANGED, mult);
    }
  }

  getMultiplier(): number {
    return this.computeMultiplier();
  }

  isRunning(): boolean {
    return this.running;
  }

  getElapsed(): number {
    return this.elapsed;
  }

  private computeMultiplier(): number {
    let mult = 1.0;
    for (const step of Balance.raid.greedSteps) {
      if (this.elapsed >= step.afterSeconds) mult = step.mult;
    }
    return mult;
  }
}
