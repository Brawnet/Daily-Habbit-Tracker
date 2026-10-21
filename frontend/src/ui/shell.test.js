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

    const header = shellLayout.children[0];
    expect(header.tagName).toBe('HEADER');
    expect(header.style.paddingTop).toBe('calc(env(safe-area-inset-top, 0px) + 12px)');
    expect(header.style.paddingLeft).toBe('max(16px, env(safe-area-inset-left, 0px))');
    expect(header.style.paddingRight).toBe('max(16px, env(safe-area-inset-right, 0px))');

    const bottomNav = mockDoc.getElementById('bottom-nav');
    expect(bottomNav.style.paddingBottom).toBe('max(12px, env(safe-area-inset-bottom, 12px))');
    expect(bottomNav.style.paddingLeft).toBe('max(8px, env(safe-area-inset-left, 0px))');
    expect(bottomNav.style.paddingRight).toBe('max(8px, env(safe-area-inset-right, 0px))');

    const toastContainer = mockDoc.getElementById('toast-container');
    expect(toastContainer.style.bottom).toBe('calc(max(12px, env(safe-area-inset-bottom, 12px)) + 64px)');
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
    const reg = await updateModule.initUpdateHandler('/sw.js');

    expect(navigator.serviceWorker.register).toHaveBeenCalledWith('/sw.js', { type: 'module' });
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
