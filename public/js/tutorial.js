// A gentle step-by-step tutorial. Each step waits until the player has done
// the thing it asks for (or presses Next), then moves on.

export class Tutorial {
  constructor(el, steps, onDone) {
    this.el = el;
    this.steps = steps;
    this.onDone = onDone;
    this.i = -1;
    el.querySelector('.tut-next').addEventListener('click', () => this.next());
    el.querySelector('.tut-skip').addEventListener('click', () => this.finish());
  }

  get active() {
    return this.i >= 0;
  }

  start() {
    this.i = 0;
    this.enter();
  }

  enter() {
    const s = this.steps[this.i];
    s.begin && s.begin();
    this.el.hidden = false;
    this.el.querySelector('.tut-step').textContent = `Step ${this.i + 1} of ${this.steps.length}`;
    this.el.querySelector('.tut-title').textContent = s.title;
    this.el.querySelector('.tut-text').innerHTML = s.text;
    this.el.querySelector('.tut-next').textContent = s.check ? 'Skip step' : this.i === this.steps.length - 1 ? 'Done' : 'Next';
    this.el.querySelector('.tut-dots').innerHTML = this.steps.map((_, k) => `<i class="${k < this.i ? 'done' : k === this.i ? 'on' : ''}"></i>`).join('');
    this.el.classList.remove('pop');
    void this.el.offsetWidth;
    this.el.classList.add('pop');
  }

  next() {
    if (this.i < 0) return;
    this.waiting = false;
    this.i++;
    if (this.i >= this.steps.length) return this.finish();
    this.enter();
  }

  finish() {
    this.i = -1;
    this.el.hidden = true;
    this.onDone && this.onDone();
  }

  update() {
    if (this.i < 0 || this.waiting) return;
    const s = this.steps[this.i];
    if (s.check && s.check()) {
      this.waiting = true;
      this.el.querySelector('.tut-text').innerHTML = `${s.text}<br><b class="tut-ok">\u2714 Nice!</b>`;
      setTimeout(() => {
        this.waiting = false;
        this.next();
      }, 1100);
    }
  }
}
