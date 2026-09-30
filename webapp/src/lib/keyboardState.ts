/** Keyboard geometry also handles Android Back / iOS Done without an input blur. */
export class KeyboardState {
  open = false;
  private baseline: number;
  private detected = false;

  constructor(height: number) { this.baseline = height; }

  focus(height: number) {
    this.baseline = Math.max(this.baseline, height);
    this.open = true;
  }

  viewport(height: number, editing: boolean) {
    const inset = this.baseline - height;
    if (inset > Math.max(100, this.baseline * .16) && (editing || this.detected)) {
      this.detected = true;
      this.open = true;
    } else if (inset < 70 && (this.detected || !editing)) {
      this.open = false;
      this.detected = false;
    } else if (!editing && !this.detected) {
      this.open = false;
    }
    if (!this.open) this.baseline = height;
  }
}
