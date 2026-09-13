import { describe, it, expect, vi } from 'vitest';
import { handleDeepLink, parseDeepLink, shareToDeepLink } from '../linking';
import { usePendingSettingsTab } from '../pending-settings-tab';

describe('parseDeepLink', () => {
  it('parses app-scheme mail links', () => {
    expect(parseDeepLink('utserviomail://mail/message/M1')).toEqual({ kind: 'message', emailId: 'M1', accountId: undefined });
    expect(parseDeepLink('bulwarkmobile://mail/message/M1')).toEqual({ kind: 'message', emailId: 'M1', accountId: undefined });
    expect(parseDeepLink('utserviomail://mail/thread/T1?account=acc')).toEqual({ kind: 'thread', threadId: 'T1', accountId: 'acc' });
    expect(parseDeepLink('utserviomail://mail/folder/inbox')).toEqual({ kind: 'folder', ref: 'inbox', accountId: undefined });
    expect(parseDeepLink('utserviomail://mail')).toEqual({ kind: 'folder', ref: 'inbox', accountId: undefined });
  });

  it('parses webmail https permalinks, ignoring host and locale prefix', () => {
    expect(parseDeepLink('https://mail.example.com/mail/message/abc%2Fdef')).toEqual({ kind: 'message', emailId: 'abc/def', accountId: undefined });
    expect(parseDeepLink('https://mail.example.com/de/contacts/C9')).toEqual({ kind: 'contact', contactId: 'C9' });
    expect(parseDeepLink('https://mail.example.com/mail?email=legacy')).toEqual({ kind: 'message', emailId: 'legacy', accountId: undefined });
  });

  it('parses calendar, contacts, files and settings links', () => {
    expect(parseDeepLink('bulwarkmobile://calendar/event/E1')).toEqual({ kind: 'calendar', eventId: 'E1' });
    expect(parseDeepLink('bulwarkmobile://calendar/week/2026-08-29')).toEqual({ kind: 'calendar', date: '2026-08-29' });
    expect(parseDeepLink('bulwarkmobile://contacts')).toEqual({ kind: 'contacts' });
    expect(parseDeepLink('bulwarkmobile://files')).toEqual({ kind: 'files' });
    expect(parseDeepLink('bulwarkmobile://settings/notifications')).toEqual({ kind: 'settings', tab: 'notifications' });
    expect(parseDeepLink('bulwarkmobile://settings')).toEqual({ kind: 'settings', tab: undefined });
  });

  it('turns mailto: into a compose link', () => {
    expect(parseDeepLink('mailto:a@b.co?subject=Hi&cc=c@d.co')).toEqual({
      kind: 'compose',
      to: [{ email: 'a@b.co' }],
      cc: [{ email: 'c@d.co' }],
      subject: 'Hi',
      body: undefined,
    });
    expect(parseDeepLink('mailto:nope')).toBeNull();
  });

  it('rejects unknown links', () => {
    expect(parseDeepLink('bulwarkmobile://whatever')).toBeNull();
    expect(parseDeepLink('garbage')).toBeNull();
    expect(parseDeepLink('')).toBeNull();
  });
});

describe('handleDeepLink', () => {
  const nav = () => ({
    isReady: () => true,
    navigate: vi.fn(),
  });

  it('resolves a message to its thread before opening the reader', async () => {
    const navigation = nav();
    const ok = await handleDeepLink(
      { kind: 'message', emailId: 'M1' },
      { navigation: navigation as never, resolveThreadId: async () => 'T1' },
    );
    expect(ok).toBe(true);
    expect(navigation.navigate).toHaveBeenCalledWith('EmailThread', { emailId: 'M1', threadId: 'T1' });
  });

  it('gives up when the message cannot be loaded', async () => {
    const navigation = nav();
    const ok = await handleDeepLink(
      { kind: 'message', emailId: 'M1' },
      { navigation: navigation as never, resolveThreadId: async () => null },
    );
    expect(ok).toBe(false);
    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  it('parks the settings tab and opens the Settings tab', async () => {
    const navigation = nav();
    await handleDeepLink(
      { kind: 'settings', tab: 'updates' },
      { navigation: navigation as never, resolveThreadId: async () => null },
    );
    expect(usePendingSettingsTab.getState().consume()).toBe('updates');
    expect(usePendingSettingsTab.getState().consume()).toBeNull();
    expect(navigation.navigate).toHaveBeenCalledWith('MainTabs', { screen: 'Settings' });
  });

  it('opens the composer with prefilled recipients', async () => {
    const navigation = nav();
    await handleDeepLink(
      { kind: 'compose', to: [{ email: 'a@b.co' }], cc: [], subject: 'S', body: 'B' },
      { navigation: navigation as never, resolveThreadId: async () => null },
    );
    expect(navigation.navigate).toHaveBeenCalledWith('Compose', {
      prefillTo: [{ email: 'a@b.co' }],
      prefillCc: undefined,
      prefillSubject: 'S',
      prefillBody: 'B',
    });
  });

  it('refuses when the linked account is not signed in', async () => {
    const navigation = nav();
    const ok = await handleDeepLink(
      { kind: 'message', emailId: 'M1', accountId: 'other' },
      { navigation: navigation as never, resolveThreadId: async () => 'T', switchAccount: async () => false },
    );
    expect(ok).toBe(false);
  });
});

describe('shareToDeepLink', () => {
  it('routes shared text into the body and shared addresses into recipients', () => {
    expect(shareToDeepLink({ text: 'hello world', subject: 'S' })).toEqual({
      kind: 'compose', to: [], cc: [], subject: 'S', body: 'hello world',
    });
    expect(shareToDeepLink({ text: 'a@b.co' })).toEqual({
      kind: 'compose', to: [{ email: 'a@b.co' }], cc: [], subject: undefined,
    });
    expect(shareToDeepLink({ text: 'mailto:a@b.co?subject=x' })).toMatchObject({ kind: 'compose', subject: 'x' });
  });
});
