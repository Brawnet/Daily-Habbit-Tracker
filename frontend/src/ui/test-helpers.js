function unregisterElementIds(el) {
  if (el.doc && el._id) {
    el.doc.elementsById.delete(el._id);
  }
  for (const child of el.children) {
    unregisterElementIds(child);
  }
}

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
    for (const child of this.children) {
      unregisterElementIds(child);
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

  getAttributeNames() {
    return Object.keys(this.attributes);
  }

  removeAttribute(name) {
    delete this.attributes[name];
    if (name.startsWith('data-')) {
      const key = name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      delete this.dataset[key];
    }
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
    unregisterElementIds(this);
    if (this.parentElement) {
      const idx = this.parentElement.children.indexOf(this);
      if (idx !== -1) {
        this.parentElement.children.splice(idx, 1);
      }
      this.parentElement = null;
    }
  }

  replaceWith(newEl) {
    unregisterElementIds(this);
    if (this.parentElement && newEl) {
      const idx = this.parentElement.children.indexOf(this);
      if (idx !== -1) {
        newEl.parentElement = this.parentElement;
        this.parentElement.children.splice(idx, 1, newEl);
      }
      this.parentElement = null;
    }
  }

  contains(node) {
    if (!node) return false;
    if (node === this) return true;
    for (const child of this.children) {
      if (child.contains && child.contains(node)) return true;
    }
    return false;
  }

  focus() {
    if (this.doc) {
      this.doc.activeElement = this;
    }
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

    const matchesSimple = (el, rawSelector) => {
      let rest = rawSelector.trim();
      if (!rest) return false;

      // Optional leading tag name
      const tagMatch = rest.match(/^[a-zA-Z0-9_-]+/);
      if (tagMatch) {
        if (el.tagName.toLowerCase() !== tagMatch[0].toLowerCase()) return false;
        rest = rest.slice(tagMatch[0].length);
      }

      // Parse zero or more #id, .class, or [attr(=val)] tokens
      while (rest.length > 0) {
        if (rest.startsWith('#')) {
          const m = rest.match(/^#([a-zA-Z0-9_-]+)/);
          if (!m) return false;
          if (el.id !== m[1] && el.getAttribute('id') !== m[1]) return false;
          rest = rest.slice(m[0].length);
        } else if (rest.startsWith('.')) {
          const m = rest.match(/^\.([a-zA-Z0-9_-]+)/);
          if (!m) return false;
          if (!el.classList.contains(m[1])) return false;
          rest = rest.slice(m[0].length);
        } else if (rest.startsWith('[')) {
          const m = rest.match(/^\[([a-zA-Z0-9_-]+)(?:=["']?([^"'\]]*)["']?)?\]/);
          if (!m) return false;
          const attrName = m[1];
          const expected = m[2];
          let actual = el.getAttribute(attrName);
          if (actual === null && attrName.startsWith('data-')) {
            const camel = attrName.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
            if (camel in el.dataset) actual = String(el.dataset[camel]);
          }
          if (expected === undefined) {
            if (actual === null) return false;
          } else if (actual !== expected) {
            return false;
          }
          rest = rest.slice(m[0].length);
        } else {
          return false;
        }
      }

      return true;
    };

    const results = [];
    const check = (el) => {
      if (matchesSimple(el, selector) && el !== this) results.push(el);

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
    this.activeElement = null;
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

export function createMemoryStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, val) => store.set(key, String(val)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
  };
}
