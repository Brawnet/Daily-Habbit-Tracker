import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MockElement, MockDocument } from './test-helpers.js';
import { createTimePickerField } from './habit-form-controls.js';

describe('ui/habit-form-controls createTimePickerField', () => {
  let mockDoc;
  let host;

  beforeEach(() => {
    mockDoc = new MockDocument();
    global.document = mockDoc;
    global.HTMLElement = MockElement;
    host = mockDoc.createElement('div');
  });

  afterEach(() => {
    delete global.document;
    delete global.HTMLElement;
  });

  it('renders a full-field clickable trigger button with placeholder or formatted initial value', () => {
    const emptyPicker = createTimePickerField({
      id: 'picker-empty',
      ariaLabel: 'Scheduled Time',
      use12Hour: true,
      locale: 'en-US',
    });
    host.appendChild(emptyPicker.container);

    expect(emptyPicker.triggerBtn.tagName).toBe('BUTTON');
    expect(emptyPicker.triggerBtn.id).toBe('picker-empty');
    expect(emptyPicker.triggerBtn.getAttribute('aria-haspopup')).toBe('dialog');
    expect(emptyPicker.triggerBtn.getAttribute('aria-expanded')).toBe('false');
    expect(emptyPicker.triggerBtn.className).toContain('min-h-[44px]');
    expect(emptyPicker.getValue()).toBe('');
    expect(emptyPicker.triggerBtn.textContent).toContain('Anytime');
    expect(emptyPicker.isOpen()).toBe(false);

    const presetPicker = createTimePickerField({
      id: 'picker-preset',
      ariaLabel: 'Reminder Time',
      value: '20:00',
      use12Hour: true,
      locale: 'en-US',
      allowClear: false,
    });
    expect(presetPicker.getValue()).toBe('20:00');
    expect(presetPicker.triggerBtn.textContent).toContain('8:00 PM');

    emptyPicker.destroy();
    presetPicker.destroy();
  });

  it('opens Light/Dark popover on trigger tap, defaults minutes to :00 when tapping hour from blank, and live-updates in 12h mode', () => {
    const onChange = vi.fn();
    const picker = createTimePickerField({
      id: 'picker-12h',
      ariaLabel: 'Scheduled Time',
      use12Hour: true,
      locale: 'en-US',
      onChange,
    });
    host.appendChild(picker.container);

    // Clicking anywhere on the trigger opens immediately
    picker.triggerBtn.click();
    expect(picker.isOpen()).toBe(true);
    expect(picker.triggerBtn.getAttribute('aria-expanded')).toBe('true');

    const dialog = picker.container.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog.className).toContain('dark:bg-[#22201E]');

    // Verify 12h controls and 5-minute steps with >= 44px touch targets
    const pmBtn = dialog.querySelector('[data-period="PM"]');
    const amBtn = dialog.querySelector('[data-period="AM"]');
    expect(amBtn).not.toBeNull();
    expect(pmBtn).not.toBeNull();
    expect(pmBtn.className).toContain('min-h-[44px]');

    const hours = dialog.querySelectorAll('[data-hour]');
    expect(hours.map((b) => b.dataset.hour)).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
      '10',
      '11',
      '12',
    ]);
    const minutes = dialog.querySelectorAll('[data-minute]');
    expect(minutes.map((b) => b.dataset.minute)).toEqual([
      '00',
      '05',
      '10',
      '15',
      '20',
      '25',
      '30',
      '35',
      '40',
      '45',
      '50',
      '55',
    ]);
    expect(hours[0].className).toContain('min-h-[44px]');
    expect(minutes[0].className).toContain('min-h-[44px]');

    // Tapping hour 6 while blank defaults period AM and minutes :00 -> 06:00
    const hour6 = dialog.querySelector('[data-hour="6"]');
    hour6.click();
    expect(picker.getValue()).toBe('06:00');
    expect(onChange).toHaveBeenLastCalledWith('06:00');

    // Tapping PM switches 06:00 -> 18:00 immediately
    pmBtn.click();
    expect(picker.getValue()).toBe('18:00');
    expect(onChange).toHaveBeenLastCalledWith('18:00');

    // Tapping minute 35 updates live to 18:35
    dialog.querySelector('[data-minute="35"]').click();
    expect(picker.getValue()).toBe('18:35');
    expect(picker.triggerBtn.dataset.time).toBe('18:35');
    expect(picker.triggerBtn.textContent).toContain('6:35 PM');
    expect(onChange).toHaveBeenLastCalledWith('18:35');

    picker.destroy();
  });

  it('supports 24-hour Device locale without AM/PM toggle', () => {
    const picker = createTimePickerField({
      id: 'picker-24h',
      ariaLabel: 'Scheduled Time',
      use12Hour: false,
      locale: 'en-GB',
    });
    host.appendChild(picker.container);
    picker.triggerBtn.click();

    const dialog = picker.container.querySelector('[role="dialog"]');
    expect(dialog.querySelector('[data-period="AM"]')).toBeNull();
    const hours24 = dialog.querySelectorAll('[data-hour]');
    expect(hours24.length).toBe(24);
    expect(hours24[0].dataset.hour).toBe('00');
    expect(hours24[23].dataset.hour).toBe('23');

    dialog.querySelector('[data-hour="17"]').click();
    dialog.querySelector('[data-minute="15"]').click();
    expect(picker.getValue()).toBe('17:15');

    picker.destroy();
  });

  it('closes via Done, Escape, and outside click, and enforces one open popover at a time', () => {
    const pickerA = createTimePickerField({
      id: 'picker-a',
      ariaLabel: 'Time A',
      use12Hour: true,
      locale: 'en-US',
    });
    const pickerB = createTimePickerField({
      id: 'picker-b',
      ariaLabel: 'Time B',
      use12Hour: true,
      locale: 'en-US',
    });
    host.appendChild(pickerA.container);
    host.appendChild(pickerB.container);

    pickerA.triggerBtn.click();
    expect(pickerA.isOpen()).toBe(true);

    // Opening B closes A automatically
    pickerB.triggerBtn.click();
    expect(pickerA.isOpen()).toBe(false);
    expect(pickerB.isOpen()).toBe(true);

    // Outside click on unrelated node closes B
    const outsideEl = mockDoc.createElement('div');
    host.appendChild(outsideEl);
    mockDoc.dispatchEvent({ type: 'click', target: outsideEl });
    expect(pickerB.isOpen()).toBe(false);

    // Escape closes an open popover and restores focus to trigger
    pickerA.triggerBtn.click();
    const focusSpy = vi.spyOn(pickerA.triggerBtn, 'focus');
    mockDoc.dispatchEvent({
      type: 'keydown',
      key: 'Escape',
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    });
    expect(pickerA.isOpen()).toBe(false);
    expect(focusSpy).toHaveBeenCalled();

    // Done closes popover
    pickerA.triggerBtn.click();
    pickerA.container.querySelector('.time-picker-done-btn').click();
    expect(pickerA.isOpen()).toBe(false);

    pickerA.destroy();
    pickerB.destroy();
  });

  it('provides footer Clear for optional Scheduled Time, omits Clear when allowClear=false, and fires onCommit only on close/commit with changes', () => {
    const onCommitOptional = vi.fn();
    const optionalPicker = createTimePickerField({
      id: 'picker-opt',
      ariaLabel: 'Scheduled Time',
      value: '07:00',
      allowClear: true,
      use12Hour: false,
      locale: 'en-GB',
      onCommit: onCommitOptional,
    });
    host.appendChild(optionalPicker.container);
    optionalPicker.triggerBtn.click();

    const clearBtn = optionalPicker.container.querySelector('.time-picker-clear-btn');
    expect(clearBtn).not.toBeNull();
    expect(clearBtn.className).toContain('min-h-[44px]');
    clearBtn.click();

    expect(optionalPicker.getValue()).toBe('');
    expect(optionalPicker.isOpen()).toBe(false);
    expect(optionalPicker.triggerBtn.textContent).toContain('Anytime');
    expect(onCommitOptional).toHaveBeenCalledTimes(1);
    expect(onCommitOptional).toHaveBeenCalledWith('');

    // Non-clearable picker (Reminder) omits Clear and commits once on Done/close only if value changed
    const onCommitReminder = vi.fn();
    const reminderPicker = createTimePickerField({
      id: 'picker-reminder',
      ariaLabel: 'Reminder Time',
      value: '20:00',
      allowClear: false,
      use12Hour: false,
      locale: 'en-GB',
      onCommit: onCommitReminder,
    });
    host.appendChild(reminderPicker.container);

    reminderPicker.triggerBtn.click();
    expect(reminderPicker.container.querySelector('.time-picker-clear-btn')).toBeNull();

    // Intermediate taps do NOT fire onCommit yet
    reminderPicker.container.querySelector('[data-hour="21"]').click();
    reminderPicker.container.querySelector('[data-minute="30"]').click();
    expect(onCommitReminder).not.toHaveBeenCalled();

    // Closing via Done commits once with final value
    reminderPicker.container.querySelector('.time-picker-done-btn').click();
    expect(onCommitReminder).toHaveBeenCalledTimes(1);
    expect(onCommitReminder).toHaveBeenCalledWith('21:30');

    // Reopening and closing with zero net change does NOT fire onCommit again
    reminderPicker.triggerBtn.click();
    reminderPicker.container.querySelector('.time-picker-done-btn').click();
    expect(onCommitReminder).toHaveBeenCalledTimes(1);

    optionalPicker.destroy();
    reminderPicker.destroy();
  });
});
