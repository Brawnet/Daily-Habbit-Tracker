import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MockElement, MockDocument } from './test-helpers.js';

describe('ui/settings.js Drive folder destination setting', () => {
  let mockDoc;
  let repoModule;
  let shellModule;
  let configModule;
  let syncModule;
  let mount;
  let settingsStore = {};

  beforeEach(async () => {
    vi.resetModules();
    mockDoc = new MockDocument();
    global.document = mockDoc;
    global.HTMLElement = MockElement;
    settingsStore = {};

    shellModule = {
      showToast: vi.fn(),
    };
    vi.doMock('./shell.js', () => shellModule);

    configModule = {
      getConfig: vi.fn(() => ({ gasUrl: 'https://script.google.com/macros/s/test/exec', pin: '1234' })),
      setConfig: vi.fn(),
      isConfigured: vi.fn(() => true),
    };
    vi.doMock('../data/config.js', () => configModule);

    syncModule = {
      getSyncStatus: vi.fn(() => ({ state: 'idle', pending: 0, lastSyncedAt: null, error: null })),
      onSyncStatus: vi.fn(() => () => {}),
      syncNow: vi.fn(async () => {}),
    };
    vi.doMock('../data/sync.js', () => syncModule);

    repoModule = {
      listHabits: vi.fn(async () => []),
      addHabit: vi.fn(async () => {}),
      renameHabit: vi.fn(async () => {}),
      moveHabit: vi.fn(async () => {}),
      setHabitArchived: vi.fn(async () => {}),
      getSetting: vi.fn(async (key) => settingsStore[key] || ''),
      setSetting: vi.fn(async (key, val) => {
        settingsStore[key] = val;
      }),
      onChange: vi.fn(() => () => {}),
    };
    vi.doMock('../data/repo.js', () => repoModule);

    vi.doMock('../pwa/install.js', () => ({
      getInstallState: vi.fn(async () => 'installed'),
      promptInstall: vi.fn(),
      onInstallStateChange: vi.fn(() => () => {}),
    }));

    vi.doMock('../pwa/push.js', () => ({
      getPushState: vi.fn(async () => 'unsupported'),
      enablePush: vi.fn(),
      sendTestPush: vi.fn(),
    }));

    const mod = await import('./settings.js');
    mount = mod.mount;
  });

  it('renders Diary Google Drive Folder input field in Sync section', async () => {
    const root = mockDoc.createElement('div');
    const cleanup = mount(root);
    await new Promise((r) => setTimeout(r, 10));

    const folderInput = root.querySelector('#sync-diary-folder');
    expect(folderInput).not.toBeNull();
    cleanup?.();
  });

  it('loads existing diaryFolderId setting and displays Drive link on mount', async () => {
    settingsStore['diaryFolderId'] = '1YixDEkQMxEvQobGhhJ-7kQaLfxsrAtcC';
    const root = mockDoc.createElement('div');
    const cleanup = mount(root);
    await new Promise((r) => setTimeout(r, 20));

    const folderInput = root.querySelector('#sync-diary-folder');
    expect(folderInput.value).toBe('1YixDEkQMxEvQobGhhJ-7kQaLfxsrAtcC');

    const link = root.querySelector('#link-open-diary-folder');
    expect(link.getAttribute('href')).toBe(
      'https://drive.google.com/drive/folders/1YixDEkQMxEvQobGhhJ-7kQaLfxsrAtcC'
    );
    expect(link.classList.contains('hidden')).toBe(false);
    cleanup?.();
  });

  it('extracts clean folder ID from pasted full URL and saves setting on change', async () => {
    const root = mockDoc.createElement('div');
    const cleanup = mount(root);
    await new Promise((r) => setTimeout(r, 10));

    const folderInput = root.querySelector('#sync-diary-folder');
    folderInput.value = 'https://drive.google.com/drive/folders/1YixDEkQMxEvQobGhhJ-7kQaLfxsrAtcC?hl=ID';
    folderInput.dispatchEvent({ type: 'change' });
    await new Promise((r) => setTimeout(r, 20));

    expect(folderInput.value).toBe('1YixDEkQMxEvQobGhhJ-7kQaLfxsrAtcC');
    expect(repoModule.setSetting).toHaveBeenCalledWith('diaryFolderId', '1YixDEkQMxEvQobGhhJ-7kQaLfxsrAtcC');
    expect(shellModule.showToast).toHaveBeenCalledWith('Drive folder saved');

    const link = root.querySelector('#link-open-diary-folder');
    expect(link.getAttribute('href')).toBe(
      'https://drive.google.com/drive/folders/1YixDEkQMxEvQobGhhJ-7kQaLfxsrAtcC'
    );
    cleanup?.();
  });

  it('clears Drive folder setting and hides link when input is emptied', async () => {
    settingsStore['diaryFolderId'] = '1YixDEkQMxEvQobGhhJ-7kQaLfxsrAtcC';
    const root = mockDoc.createElement('div');
    const cleanup = mount(root);
    await new Promise((r) => setTimeout(r, 20));

    const folderInput = root.querySelector('#sync-diary-folder');
    folderInput.value = '';
    folderInput.dispatchEvent({ type: 'change' });
    await new Promise((r) => setTimeout(r, 20));

    expect(repoModule.setSetting).toHaveBeenCalledWith('diaryFolderId', '');
    expect(shellModule.showToast).toHaveBeenCalledWith('Drive folder reset to default');

    const link = root.querySelector('#link-open-diary-folder');
    expect(link.classList.contains('hidden')).toBe(true);
    cleanup?.();
  });
});
