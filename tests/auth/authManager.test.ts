import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuthManager } from '../../src/core/auth/authManager';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

describe('AuthManager Multi-Account & Persistence', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('starts with no active account when storage is empty', () => {
    const auth = new AuthManager();
    expect(auth.getActiveAccount()).toBeNull();
    expect(auth.getSavedAccounts()).toHaveLength(0);
  });

  it('can create multiple accounts and switch between them', async () => {
    const auth = new AuthManager();

    const acc1 = await auth.createAccount('thaaru@example.com', 'Thaaru');
    expect(auth.getActiveAccount()?.email).toBe('thaaru@example.com');
    expect(auth.getActiveAccount()?.displayName).toBe('Thaaru');

    const acc2 = await auth.createAccount('second@example.com', 'Second User');
    expect(acc2.email).toBe('second@example.com');
    expect(auth.getActiveAccount()?.email).toBe('second@example.com');
    expect(auth.getSavedAccounts()).toHaveLength(2);

    // Switch back to account 1
    auth.switchAccount(acc1.id);
    expect(auth.getActiveAccount()?.id).toBe(acc1.id);
    expect(auth.getActiveAccount()?.displayName).toBe('Thaaru');
  });

  it('persists active account and saved accounts across reloads', async () => {
    const auth1 = new AuthManager();
    await auth1.createAccount('persisted@example.com', 'Persisted User');

    // Simulate page reload / new instance
    const auth2 = new AuthManager();
    const active = auth2.getActiveAccount();
    expect(active).not.toBeNull();
    expect(active?.email).toBe('persisted@example.com');
    expect(active?.displayName).toBe('Persisted User');
    expect(auth2.getSavedAccounts()).toHaveLength(1);
  });

  it('removes accounts properly', async () => {
    const auth = new AuthManager();
    const acc1 = await auth.createAccount('user1@example.com', 'User 1');
    const acc2 = await auth.createAccount('user2@example.com', 'User 2');

    expect(auth.getSavedAccounts()).toHaveLength(2);
    auth.removeAccount(acc2.id);

    expect(auth.getSavedAccounts()).toHaveLength(1);
    expect(auth.getActiveAccount()?.id).toBe(acc1.id);
  });

  it('notifies subscribers on account change', async () => {
    const auth = new AuthManager();
    let notificationCount = 0;
    let currentAccountName: string | undefined;

    auth.subscribe((account) => {
      notificationCount++;
      currentAccountName = account?.displayName;
    });

    await auth.createAccount('sub@example.com', 'Subscriber User');
    expect(notificationCount).toBe(2); // 1 initial + 1 on create
    expect(currentAccountName).toBe('Subscriber User');
  });
});
