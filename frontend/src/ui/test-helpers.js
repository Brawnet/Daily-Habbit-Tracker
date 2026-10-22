export class MockClassList {
  constructor(el) {
    this.el = el;
    this.classes = new Set();
  }
  add(...names) {
    for (const n of names) {
      if (!n) continue;
      for (const part of n.split(/\s+/)) {
        if (part) this.classes.add(part);
      }
    }
    this.el._className = Array.from(this.classes).join(' ');
  }
  remove(...names) {
    for (const n of names) {
      if (!n) continue;
      for (const part of n.split(/\s+/)) {
        this.classes.delete(part);
      }
    }
    this.el._className = Array.from(this.classes).join(' ');
  }
  contains(name) {
    return this.classes.has(name);
  }
}

export class MockElement {
  constructor(tagName, doc) {
    this.tagName = tagName.toUpperCase();
    this.doc = doc;
    this.children = [];
    this.attributes = {};
    this.dataset = {};
    this.style = {};
    this.listeners = {};
    this.parentElement = null;
    this._className = '';
    this.classList = new MockClassList(this);
    this._textContent = '';
    this._innerHTML = '';
    this._value = '';
    this.disabled = false;
    this._id = '';
    this.type = 'button';
  }

  get id() {
    return this._id;
  }
  set id(val) {
    this._id = String(val || '');
    this.attributes['id'] = this._id;
    if (this.doc && this._id) {
      this.doc.elementsById.set(this._id, this);
    }
  }

  get value() {
    return this._value;
  }
  set value(val) {
    this._value = String(val ?? '');
  }

  get className() {
    return this._className;
  }
  set className(val) {
    this._className = val || '';
    this.classList.classes.clear();
    for (const part of this._className.split(/\s+/)) {
      if (part) this.classList.classes.add(part);
    }
  }

  get textContent() {
    if (this.children.length > 0) {
      return this.children.map((c) => c.textContent).join('');
    }
    return this._textContent;
  }
  set textContent(val) {
    this._textContent = String(val ?? '');
  }

  get innerHTML() {
    return this._innerHTML;
  }
  set innerHTML(val) {
    this._innerHTML = String(val ?? '');
    const unregister = (el) => {
      if (el.doc && el._id) {
        el.doc.elementsById.delete(el._id);
      }
      for (const child of el.children) {
        unregister(child);
      }
    };
    for (const child of this.children) {
      unregister(child);
    }
    this.children = [];
  }

  setAttribute(name, val) {
    this.attributes[name] = String(val);
    if (name === 'id') {
      this.id = val;
    }
    if (name.startsWith('data-')) {
      const key = name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      this.dataset[key] = String(val);
    }
  }

  getAttribute(name) {
    return this.attributes[name] ?? null;
  }

  removeAttribute(name) {
    delete this.attributes[name];
    if (name === 'id') {
      if (this.doc && this._id) {
        this.doc.elementsById.delete(this._id);
      }
      this._id = '';
    }
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  remove() {
    if (this.parentElement) {
      const idx = this.parentElement.children.indexOf(this);
      if (idx !== -1) {
        this.parentElement.children.splice(idx, 1);
      }
      this.parentElement = null;
    }
  }

  focus() {}

  addEventListener(type, handler) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(handler);
  }

  removeEventListener(type, handler) {
    if (!this.listeners[type]) return;
    this.listeners[type] = this.listeners[type].filter((h) => h !== handler);
  }

  dispatchEvent(event) {
    const handlers = this.listeners[event.type] || [];
    for (const handler of handlers) {
      handler(event);
    }
    return true;
  }

  click() {
    const event = {
      type: 'click',
      target: this,
      preventDefault: () => {},
      stopPropagation: () => {},
    };
    this.dispatchEvent(event);
  }

  querySelector(selector) {
    const all = this.querySelectorAll(selector);
    return all.length > 0 ? all[0] : null;
  }

  querySelectorAll(selector) {
    if (selector.includes(',')) {
      const parts = selector.split(',').map((s) => s.trim());
      const set = new Set();
      for (const p of parts) {
        for (const el of this.querySelectorAll(p)) {
          set.add(el);
        }
      }
      return Array.from(set);
    }

    const results = [];
    const check = (el) => {
      let match = true;
      if (selector.startsWith('#')) {
        const id = selector.slice(1);
        if (el.id !== id && el.getAttribute('id') !== id) match = false;
      } else if (selector.startsWith('.')) {
        const cls = selector.slice(1);
        if (!el.classList.contains(cls)) match = false;
      } else if (selector.includes('[data-action=')) {
        const action = selector.match(/\[data-action="?([^"\]]+)"?\]/)?.[1];
        if (el.dataset.action !== action) match = false;
      } else if (selector.includes('[data-id=')) {
        const id = selector.match(/\[data-id="?([^"\]]+)"?\]/)?.[1];
        if (el.dataset.id !== id && el.getAttribute('data-id') !== id) match = false;
      } else if (selector.includes('[data-starter-chip]')) {
        if (!('starterChip' in el.dataset)) match = false;
      } else if (selector.includes('[data-tab]')) {
        if (!('tab' in el.dataset)) match = false;
      } else if (/^[a-zA-Z0-9_-]+$/.test(selector)) {
        if (el.tagName.toLowerCase() !== selector.toLowerCase()) match = false;
      }
      if (match && el !== this) results.push(el);

      for (const child of el.children) {
        check(child);
      }
    };
    check(this);
    return results;
  }
}

export class MockDocument {
  constructor() {
    this.elementsById = new Map();
    this.visibilityState = 'visible';
    this.listeners = {};
  }

  createElement(tag) {
    return new MockElement(tag, this);
  }

  getElementById(id) {
    return this.elementsById.get(id) || null;
  }

  addEventListener(type, handler) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(handler);
  }

  removeEventListener(type, handler) {
    if (!this.listeners[type]) return;
    this.listeners[type] = this.listeners[type].filter((h) => h !== handler);
  }

  dispatchEvent(event) {
    const handlers = this.listeners[event.type] || [];
    for (const handler of handlers) {
      handler(event);
    }
    return true;
  }
}
