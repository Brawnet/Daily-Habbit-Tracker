import './styles.css';
import { mountShell, registerTab, navigate } from './ui/shell.js';
import { mount as mountToday } from './ui/today.js';
import { mount as mountHistory } from './ui/history.js';
import { mount as mountActivities } from './ui/activities.js';
import { mount as mountSettings } from './ui/settings.js';
import { startAutoSync } from './data/sync.js';
import { initUpdateHandler } from './pwa/update.js';
import './pwa/install.js';

// Icons for the 3 main tabs
const todayIcon = `
  <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
    <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
`;

const historyIcon = `
  <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
    <path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
`;
const activitiesIcon = `
  <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
    <path stroke-linecap="round" stroke-linejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
  </svg>
`;

const settingsIcon = `
  <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
    <path stroke-linecap="round" stroke-linejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
`;

// Register application tabs (SPEC §10)
registerTab('today', {
  title: 'Today',
  icon: todayIcon,
  mount: mountToday,
});

registerTab('history', {
  title: 'History',
  icon: historyIcon,
  mount: mountHistory,
});
registerTab('settings', {
  title: 'Settings',
  icon: settingsIcon,
  mount: mountSettings,
});

registerTab('activities', {
  title: 'Activities',
  icon: activitiesIcon,
  mount: mountActivities,
});

// Start background auto sync if available
try {
  startAutoSync();
} catch (err) {
  console.warn('AutoSync startup deferred:', err);
}

// Mount the shell into the root #app element
const app = document.getElementById('app');
if (app) {
  mountShell(app);

  // Read URL ?tab= parameter (default 'today')
  let initialTab = 'today';
  try {
    const params = new URLSearchParams(window.location.search);
    const urlTab = params.get('tab');
    if (urlTab === 'history' || urlTab === 'activities' || urlTab === 'settings' || urlTab === 'today') {
      initialTab = urlTab;
    }
  } catch {}

  navigate(initialTab);
}
// Listen for service worker updates
initUpdateHandler();
