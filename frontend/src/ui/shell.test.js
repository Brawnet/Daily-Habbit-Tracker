import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { MockElement, MockDocument } from './test-helpers.js';

class MockWindow {
  constructor() {
    this.location = new URL('https://habbit.test/?tab=today');
    this.history = {
      replaceState: vi.fn((state, _, url) => {
        this.location = new URL(url, 'https://habbit.test/');
      }),
      pushState: vi.fn((state, _, url) => {
        this.location = new URL(url, 'https://habbit.test/');
      }),
    };
    this.listeners = {};
  }

  matchMedia(query) {
    return {
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
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
  }
}

const origNavigatorDesc = Object.getOwnPropertyDescriptor(globalThis, 'navigator');

function setMockNavigator(mockNav) {
  Object.defineProperty(globalThis, 'navigator', {
    value: mockNav,
    configurable: true,
    writable: true,
  });
}

function restoreNavigator() {
  if (origNavigatorDesc) {
    Object.defineProperty(globalThis, 'navigator', origNavigatorDesc);
  } else {
    delete globalThis.navigator;
  }
}

let mockDoc;
let mockWin;

describe('ui/shell.js', () => {
  let mountShell;
  let registerTab;
  let navigate;
  let showToast;
  let syncModule;

  beforeEach(async () => {
    vi.resetModules();
    mockDoc = new MockDocument();
    mockWin = new MockWindow();

    global.document = mockDoc;
    global.window = mockWin;
    global.HTMLElement = MockElement;

    // Mock dependencies
    vi.doMock('../data/sync.js', () => {
      let currentStatus = {
        state: 'not-configured',
        pending: 0,
        lastSyncedAt: null,
        error: null,
      };
      const listeners = new Set();
      return {
        getSyncStatus: vi.fn(() => currentStatus),
        syncNow: vi.fn(async () => {}),
        onSyncStatus: vi.fn((listener) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        }),
        _setStatus: (newStatus) => {
          currentStatus = newStatus;
          for (const l of listeners) l(currentStatus);
        },
      };
    });

    vi.doMock('../domain/day.js', () => ({
      today: vi.fn(() => '2026-10-20'),
      msUntilNextDay: vi.fn(() => 3600000),
    }));

    const shell = await import('./shell.js');
    mountShell = shell.mountShell;
    registerTab = shell.registerTab;
    navigate = shell.navigate;
    showToast = shell.showToast;

    syncModule = await import('../data/sync.js');
  });

  afterEach(() => {
    delete global.document;
    delete global.window;
    delete global.HTMLElement;
    vi.restoreAllMocks();
  });

  it('mounts master shell and creates core DOM elements', () => {
    const root = mockDoc.createElement('div');
    root.id = 'app';

    mountShell(root);

    const syncDot = mockDoc.getElementById('sync-dot');
    const syncText = mockDoc.getElementById('sync-text');
    const syncBadge = mockDoc.getElementById('sync-badge');
    const syncBtn = mockDoc.getElementById('sync-now-btn');
    const tabContent = mockDoc.getElementById('tab-content');
    const bottomNav = mockDoc.getElementById('bottom-nav');
    const toastContainer = mockDoc.getElementById('toast-container');

    expect(syncDot).toBeDefined();
    expect(syncText).toBeDefined();
    expect(syncText.textContent).toBe('Offline / Local');
    expect(syncBadge).toBeDefined();
    expect(syncBtn).toBeDefined();
    expect(tabContent).toBeDefined();
    expect(bottomNav).toBeDefined();
    expect(toastContainer).toBeDefined();
  });
  it('applies iOS standalone safe area insets and resilient padding on shell layout elements', () => {
    const root = mockDoc.createElement('div');
    root.id = 'app';

    mountShell(root);

    const shellLayout = root.children[0];
    expect(shellLayout).toBeDefined();
    expect(shellLayout.className).toContain('shell-layout');
    expect(shellLayout.className).toContain('relative');

    const header = shellLayout.children[0];
    expect(header.tagName).toBe('HEADER');
    expect(header.style.paddingTop).toBe('calc(env(safe-area-inset-top, 0px) + 12px)');
    expect(header.style.paddingLeft).toBe('max(16px, env(safe-area-inset-left, 0px))');
    expect(header.style.paddingRight).toBe('max(16px, env(safe-area-inset-right, 0px))');

    const tabContent = mockDoc.getElementById('tab-content');
    expect(tabContent.style.paddingBottom).toBe('calc(max(12px, env(safe-area-inset-bottom, 12px)) + 88px)');

    const bottomNav = mockDoc.getElementById('bottom-nav');
    expect(bottomNav.style.bottom).toBe('max(12px, env(safe-area-inset-bottom, 12px))');
    expect(bottomNav.style.left).toBe('max(16px, env(safe-area-inset-left, 0px))');
    expect(bottomNav.style.right).toBe('max(16px, env(safe-area-inset-right, 0px))');

    const toastContainer = mockDoc.getElementById('toast-container');
    expect(toastContainer.style.bottom).toBe('calc(max(12px, env(safe-area-inset-bottom, 12px)) + 84px)');
  });

  it('synchronizes --app-height dynamically in standalone mode via syncAppHeight', async () => {
    const { syncAppHeight } = await import('./shell.js');
    setMockNavigator({
      standalone: true,
    });
    mockDoc.documentElement = {
      style: {
        setProperty: vi.fn(),
      },
    };
    mockWin.innerHeight = 848;
    mockWin.innerWidth = 414;
    mockWin.screen = { height: 896, width: 414 };

    syncAppHeight();

    expect(mockDoc.documentElement.style.setProperty).toHaveBeenCalledWith(
      '--app-height',
      '896px'
    );
  });


  it('registers tabs, mounts active tab and switches tabs with cleanup', () => {
    const root = mockDoc.createElement('div');
    const todayCleanup = vi.fn();
    const historyCleanup = vi.fn();

    const mountToday = vi.fn((el) => {
      el.textContent = 'Today Content';
      return todayCleanup;
    });

    const mountHistory = vi.fn((el) => {
      el.textContent = 'History Content';
      return historyCleanup;
    });

    registerTab('today', { title: 'Today', icon: '<span>today-ico</span>', mount: mountToday });
    registerTab('history', { title: 'History', icon: '<span>hist-ico</span>', mount: mountHistory });

    mountShell(root);

    // Initial mount defaults to today
    expect(mountToday).toHaveBeenCalledTimes(1);
    expect(todayCleanup).not.toHaveBeenCalled();

    const tabContent = mockDoc.getElementById('tab-content');
    expect(tabContent.textContent).toBe('Today Content');

    // Switch to history
    navigate('history');
    expect(todayCleanup).toHaveBeenCalledTimes(1);
    expect(mountHistory).toHaveBeenCalledTimes(1);
    expect(tabContent.textContent).toBe('History Content');

    // History is reflected in URL
    expect(mockWin.location.search).toBe('?tab=history');

    // Switch back to today
    navigate('today');
    expect(historyCleanup).toHaveBeenCalledTimes(1);
    expect(mountToday).toHaveBeenCalledTimes(2);
  });

  it('mounts 4th tab Activities in navigation shell with icon and responsive routing', () => {
    const root = mockDoc.createElement('div');
    const mountToday = vi.fn();
    const mountHistory = vi.fn();
    const mountActivities = vi.fn((el) => {
      el.textContent = 'Activities View';
    });
    const mountSettings = vi.fn();

    registerTab('today', { title: 'Today', icon: '<span>today-ico</span>', mount: mountToday });
    registerTab('activities', { title: 'Activities', icon: '<span>act-ico</span>', mount: mountActivities });
    registerTab('history', { title: 'History', icon: '<span>hist-ico</span>', mount: mountHistory });
    registerTab('settings', { title: 'Settings', icon: '<span>set-ico</span>', mount: mountSettings });

    mountShell(root);

    const bottomNav = mockDoc.getElementById('bottom-nav');
    expect(bottomNav).not.toBeNull();

    const buttons = bottomNav.querySelectorAll('button[data-tab]');
    expect(buttons.length).toBe(4);
    expect(buttons[0].dataset.tab).toBe('today');
    expect(buttons[1].dataset.tab).toBe('activities');

    const actBtn = mockDoc.getElementById('tab-btn-activities');
    expect(actBtn).not.toBeNull();
    expect(actBtn.dataset.tab).toBe('activities');
    expect(actBtn.textContent).toContain('Activities');
    const iconSpan = actBtn.querySelector('.tab-icon');
    expect(iconSpan.innerHTML).toContain('act-ico');

    // Route to activities
    navigate('activities');
    expect(mountActivities).toHaveBeenCalledTimes(1);
    expect(actBtn.getAttribute('aria-selected')).toBe('true');
    expect(mockWin.location.search).toBe('?tab=activities');

    const tabContent = mockDoc.getElementById('tab-content');
    expect(tabContent.textContent).toBe('Activities View');
  });

  it('renders floating solid flat bottom navigation buttons with visible labels, aria-label attributes, and >=44px touch targets', () => {
    const root = mockDoc.createElement('div');
    registerTab('today', { title: 'Today', icon: '<span>t</span>', mount: vi.fn() });
    registerTab('activities', { title: 'Activities', icon: '<span>a</span>', mount: vi.fn() });
    registerTab('history', { title: 'History', icon: '<span>h</span>', mount: vi.fn() });
    registerTab('settings', { title: 'Settings', icon: '<span>s</span>', mount: vi.fn() });

    mountShell(root);

    const bottomNav = mockDoc.getElementById('bottom-nav');
    expect(bottomNav.classList.contains('floating-bottom-nav')).toBe(true);
    expect(bottomNav.classList.contains('liquid-glass-nav')).toBe(false);

    const expected = [
      { id: 'today', title: 'Today' },
      { id: 'activities', title: 'Activities' },
      { id: 'history', title: 'History' },
      { id: 'settings', title: 'Settings' },
    ];

    for (const item of expected) {
      const btn = mockDoc.getElementById(`tab-btn-${item.id}`);
      expect(btn.getAttribute('role')).toBe('tab');
      expect(btn.getAttribute('aria-label')).toBe(item.title);
      expect(btn.title).toBe(item.title);
      expect(btn.classList.contains('floating-bottom-nav-tab')).toBe(true);
      expect(btn.classList.contains('min-w-[44px]')).toBe(true);
      expect(btn.classList.contains('min-h-[48px]')).toBe(true);
      const labelSpan = btn.querySelector('.tab-title');
      expect(labelSpan).not.toBeNull();
      expect(labelSpan.classList.contains('sr-only')).toBe(false);
      expect(labelSpan.classList.contains('text-[11px]')).toBe(true);
      expect(labelSpan.textContent).toBe(item.title);
    }
  });

  it('swaps between outline and solid-filled icons when switching tabs and falls back to single icon', () => {
    const root = mockDoc.createElement('div');
    registerTab('today', {
      title: 'Today',
      icon: '<svg data-kind="outline-today"></svg>',
      activeIcon: '<svg data-kind="solid-today"></svg>',
      mount: vi.fn(),
    });
    registerTab('activities', {
      title: 'Activities',
      icon: '<svg data-kind="outline-act"></svg>',
      activeIcon: '<svg data-kind="solid-act"></svg>',
      mount: vi.fn(),
    });
    registerTab('history', {
      title: 'History',
      icon: '<svg data-kind="single-history"></svg>',
      mount: vi.fn(),
    });

    mountShell(root);

    const todayIconEl = mockDoc.getElementById('tab-btn-today').querySelector('.tab-icon');
    const actIconEl = mockDoc.getElementById('tab-btn-activities').querySelector('.tab-icon');
    const histIconEl = mockDoc.getElementById('tab-btn-history').querySelector('.tab-icon');

    expect(todayIconEl.innerHTML).toContain('solid-today');
    expect(actIconEl.innerHTML).toContain('outline-act');
    expect(histIconEl.innerHTML).toContain('single-history');

    navigate('activities');
    expect(todayIconEl.innerHTML).toContain('outline-today');
    expect(actIconEl.innerHTML).toContain('solid-act');

    navigate('history');
    expect(actIconEl.innerHTML).toContain('outline-act');
    expect(histIconEl.innerHTML).toContain('single-history');
  });

  it('omits sliding indicator capsule and updates aria-selected across navigate and popstate transitions', () => {
    const root = mockDoc.createElement('div');
    registerTab('today', { title: 'Today', icon: '<span>t</span>', mount: vi.fn() });
    registerTab('activities', { title: 'Activities', icon: '<span>a</span>', mount: vi.fn() });
    registerTab('history', { title: 'History', icon: '<span>h</span>', mount: vi.fn() });
    registerTab('settings', { title: 'Settings', icon: '<span>s</span>', mount: vi.fn() });

    mountShell(root);

    const bottomNav = mockDoc.getElementById('bottom-nav');
    const indicator = bottomNav.querySelector('#bottom-nav-indicator');
    expect(indicator).toBeNull();

    expect(mockDoc.getElementById('tab-btn-today').getAttribute('aria-selected')).toBe('true');

    navigate('activities');
    expect(mockDoc.getElementById('tab-btn-today').getAttribute('aria-selected')).toBe('false');
    expect(mockDoc.getElementById('tab-btn-activities').getAttribute('aria-selected')).toBe('true');

    navigate('history');
    expect(mockDoc.getElementById('tab-btn-activities').getAttribute('aria-selected')).toBe('false');
    expect(mockDoc.getElementById('tab-btn-history').getAttribute('aria-selected')).toBe('true');

    navigate('settings');
    expect(mockDoc.getElementById('tab-btn-history').getAttribute('aria-selected')).toBe('false');
    expect(mockDoc.getElementById('tab-btn-settings').getAttribute('aria-selected')).toBe('true');

    // Verify browser popstate updates selected tab too
    mockWin.location = new URL('https://habbit.test/?tab=activities');
    mockWin.dispatchEvent({ type: 'popstate' });
    expect(mockDoc.getElementById('tab-btn-settings').getAttribute('aria-selected')).toBe('false');
    expect(mockDoc.getElementById('tab-btn-activities').getAttribute('aria-selected')).toBe('true');
  });

  it('updates sync status indicator and pending badge live', () => {
    const root = mockDoc.createElement('div');
    mountShell(root);

    const syncDot = mockDoc.getElementById('sync-dot');
    const syncText = mockDoc.getElementById('sync-text');
    const syncBadge = mockDoc.getElementById('sync-badge');

    expect(syncText.textContent).toBe('Offline / Local');
    expect(syncText.className).toContain('hidden min-[380px]:inline');
    expect(syncDot.classList.contains('bg-zinc-400')).toBe(true);

    // Change status to syncing with pending = 3
    syncModule._setStatus({
      state: 'syncing',
      pending: 3,
      lastSyncedAt: null,
      error: null,
    });

    expect(syncText.textContent).toBe('Syncing...');
    expect(syncText.className).toBe('inline truncate max-w-[120px]');
    expect(syncDot.classList.contains('bg-amber-400')).toBe(true);
    expect(syncBadge.textContent).toBe('3');
    expect(syncBadge.classList.contains('hidden')).toBe(false);
    // Change status to synced with pending = 0
    syncModule._setStatus({
      state: 'idle',
      pending: 0,
      lastSyncedAt: '2026-10-20T12:00:00Z',
      error: null,
    });

    expect(syncText.textContent).toBe('Synced');
    expect(syncText.className).toBe('inline truncate max-w-[120px]');
    expect(syncDot.classList.contains('bg-emerald-500')).toBe(true);
    expect(syncBadge.classList.contains('hidden')).toBe(true);

    // Change status to error
    syncModule._setStatus({
      state: 'error',
      pending: 0,
      lastSyncedAt: null,
      error: 'Network failure',
    });

    expect(syncText.textContent).toBe('Error');
    expect(syncText.className).toBe('inline truncate max-w-[120px]');
    expect(syncDot.classList.contains('bg-rose-500')).toBe(true);
  });

  it('triggers syncNow when Sync now button is clicked', async () => {
    const root = mockDoc.createElement('div');
    mountShell(root);

    const syncBtn = mockDoc.getElementById('sync-now-btn');
    expect(syncBtn).toBeDefined();

    syncBtn.click();
    expect(syncModule.syncNow).toHaveBeenCalledTimes(1);
  });

  it('shows floating toast with message and action button', () => {
    const root = mockDoc.createElement('div');
    mountShell(root);

    const onActionClick = vi.fn();
    const dismiss = showToast('Update available', {
      action: {
        label: 'Reload',
        onClick: onActionClick,
      },
    });

    const toastContainer = mockDoc.getElementById('toast-container');
    expect(toastContainer.children.length).toBe(1);

    const toast = toastContainer.children[0];
    expect(toast.getAttribute('role')).toBe('status');
    expect(toast.getAttribute('aria-live')).toBe('polite');

    const button = toast.children.find((c) => c.tagName === 'BUTTON');
    expect(button).toBeDefined();
    expect(button.textContent).toBe('Reload');

    button.click();
    expect(onActionClick).toHaveBeenCalledTimes(1);

    dismiss();
  });

  it('shows top toast at safe-area top offset and auto-dismisses after custom duration (3000ms)', () => {
    vi.useFakeTimers();
    try {
      const root = mockDoc.createElement('div');
      mountShell(root);

      showToast('Your journal has been saved', { position: 'top', duration: 3000 });

      const topContainer = mockDoc.getElementById('top-toast-container');
      const bottomContainer = mockDoc.getElementById('toast-container');
      expect(topContainer).toBeDefined();
      expect(topContainer.style.top).toBe('calc(env(safe-area-inset-top, 0px) + 12px)');
      expect(topContainer.children.length).toBe(1);
      expect(topContainer.children[0].textContent).toContain('Your journal has been saved');
      expect(bottomContainer.children.length).toBe(0);

      // Still visible before 3000ms
      vi.advanceTimersByTime(2900);
      expect(topContainer.children.length).toBe(1);

      // Auto-dismisses at 3000ms + 200ms exit transition
      vi.advanceTimersByTime(300);
      expect(topContainer.children.length).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('re-renders active tab when day changes on visibilitychange', async () => {
    const dayModule = await import('../domain/day.js');
    dayModule.today.mockReturnValue('2026-10-20');

    const root = mockDoc.createElement('div');
    const mountToday = vi.fn();
    registerTab('today', { title: 'Today', icon: '', mount: mountToday });

    mountShell(root);
    expect(mountToday).toHaveBeenCalledTimes(1);

    // Simulate midnight passing to next day
    dayModule.today.mockReturnValue('2026-10-21');

    // Trigger visibilitychange to visible
    mockDoc.visibilityState = 'visible';
    mockDoc.dispatchEvent({ type: 'visibilitychange' });

    // Should have re-rendered active tab
    expect(mountToday).toHaveBeenCalledTimes(2);
  });
});

describe('pwa/install.js', () => {
  let installModule;

  beforeEach(async () => {
    vi.resetModules();
    mockWin = new MockWindow();
    global.window = mockWin;
    setMockNavigator({
      userAgent: 'Mozilla/5.0 (Linux; Android 14) Chrome/120.0 Mobile',
      standalone: false,
      storage: { persist: vi.fn(async () => true) },
    });
    installModule = await import('../pwa/install.js');
  });

  afterEach(() => {
    delete global.window;
    restoreNavigator();
  });

  it('returns unsupported by default when no prompt or iOS detected', () => {
    expect(installModule.getInstallState()).toBe('unsupported');
  });

  it('returns installed when navigator.standalone is true', () => {
    setMockNavigator({
      userAgent: 'Mozilla/5.0 (Linux; Android 14)',
      standalone: true,
      storage: { persist: vi.fn() },
    });
    expect(installModule.getInstallState()).toBe('installed');
  });

  it('returns ios-safari when running in iOS Safari non-standalone', () => {
    setMockNavigator({
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      standalone: false,
      storage: { persist: vi.fn() },
    });
    expect(installModule.getInstallState()).toBe('ios-safari');
  });

  it('captures beforeinstallprompt event and transitions to android-prompt', async () => {
    const promptSpy = vi.fn(async () => {});
    const promptEvent = {
      type: 'beforeinstallprompt',
      preventDefault: vi.fn(),
      prompt: promptSpy,
      userChoice: Promise.resolve({ outcome: 'accepted' }),
    };

    mockWin.dispatchEvent(promptEvent);
    expect(installModule.getInstallState()).toBe('android-prompt');

    const accepted = await installModule.promptInstall();
    expect(accepted).toBe(true);
    expect(promptSpy).toHaveBeenCalledTimes(1);
    expect(installModule.getInstallState()).toBe('unsupported');
  });
});

describe('pwa/push.js', () => {
  let pushModule;
  let apiModule;

  beforeEach(async () => {
    vi.resetModules();
    mockWin = new MockWindow();
    global.window = mockWin;
    setMockNavigator({
      userAgent: 'Mozilla/5.0 (Linux; Android 14)',
      standalone: false,
      serviceWorker: {
        ready: Promise.resolve({
          pushManager: {
            getSubscription: vi.fn(async () => null),
            subscribe: vi.fn(async () => ({
              endpoint: 'https://push.example.com/test-endpoint',
              toJSON: () => ({ endpoint: 'https://push.example.com/test-endpoint' }),
            })),
          },
        }),
      },
    });
    global.Notification = {
      permission: 'default',
      requestPermission: vi.fn(async () => 'granted'),
    };
    global.PushManager = {};
    mockWin.Notification = global.Notification;
    mockWin.PushManager = global.PushManager;

    vi.doMock('../data/api.js', () => ({
      callApi: vi.fn(async () => ({ ok: true })),
    }));

    pushModule = await import('../pwa/push.js');
    apiModule = await import('../data/api.js');
  });

  afterEach(() => {
    delete global.window;
    delete global.Notification;
    delete global.PushManager;
    restoreNavigator();
  });

  it('converts base64 VAPID key to Uint8Array', () => {
    const arr = pushModule.urlBase64ToUint8Array('BMockVapidKeyString');
    expect(arr).toBeInstanceOf(Uint8Array);
    expect(arr.length).toBeGreaterThan(0);
  });

  it('detects push state transitions', async () => {
    expect(await pushModule.getPushState()).toBe('default');

    global.Notification.permission = 'denied';
    expect(await pushModule.getPushState()).toBe('denied');

    global.Notification.permission = 'granted';
    expect(await pushModule.getPushState()).toBe('default');

    const reg = await global.navigator.serviceWorker.ready;
    reg.pushManager.getSubscription.mockResolvedValueOnce({ endpoint: 'https://test' });
    expect(await pushModule.getPushState()).toBe('subscribed');
  });

  it('enables push notification when permission granted', async () => {
    process.env.VITE_VAPID_PUBLIC_KEY = 'BAAAAAAAAABBBBBBBBBB';
    const success = await pushModule.enablePush();
    expect(success).toBe(true);
    expect(apiModule.callApi).toHaveBeenCalledWith('subscribePush', {
      subscription: { endpoint: 'https://push.example.com/test-endpoint' },
    });
  });

  it('sends test push via callApi', async () => {
    await pushModule.sendTestPush();
    expect(apiModule.callApi).toHaveBeenCalledWith('testPush');
  });
});

describe('pwa/update.js', () => {
  let updateModule;
  let shellModule;

  beforeEach(async () => {
    vi.resetModules();
    mockWin = new MockWindow();
    mockWin.location.reload = vi.fn();
    global.window = mockWin;

    vi.doMock('./shell.js', () => ({
      showToast: vi.fn(),
    }));

    shellModule = await import('./shell.js');
  });

  afterEach(() => {
    delete global.window;
    restoreNavigator();
  });

  it('registers service worker and listens for updatefound', async () => {
    const updateListeners = [];
    const workerStateListeners = [];
    const postMessageSpy = vi.fn();

    const mockWorker = {
      state: 'installing',
      postMessage: postMessageSpy,
      addEventListener: vi.fn((event, cb) => {
        if (event === 'statechange') workerStateListeners.push(cb);
      }),
    };

    const mockReg = {
      installing: mockWorker,
      waiting: null,
      addEventListener: vi.fn((event, cb) => {
        if (event === 'updatefound') updateListeners.push(cb);
      }),
    };

    setMockNavigator({
      serviceWorker: {
        register: vi.fn(async () => mockReg),
        controller: {},
      },
    });

    updateModule = await import('../pwa/update.js');
    const reg = await updateModule.initUpdateHandler('/sw.js', { force: true });

    expect(navigator.serviceWorker.register).toHaveBeenCalledWith('/sw.js', { scope: '/' });
    expect(reg).toBe(mockReg);

    // Trigger updatefound
    for (const l of updateListeners) l();

    // Transition worker to installed
    mockWorker.state = 'installed';
    for (const l of workerStateListeners) l();

    expect(shellModule.showToast).toHaveBeenCalledWith('Update available', {
      action: {
        label: 'Reload',
        onClick: expect.any(Function),
      },
    });

    // Execute onClick action
    const toastArgs = shellModule.showToast.mock.calls[0][1];
    toastArgs.action.onClick();

    expect(postMessageSpy).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    expect(mockWin.location.reload).toHaveBeenCalledTimes(1);
  });
});
