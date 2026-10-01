import { getSupabaseClient, isSupabaseConfigured } from '../supabase/client';

export interface UserAccount {
  id: string;
  email: string;
  displayName: string;
  avatarGradient: string;
  createdAt: number;
  lastLoginAt: number;
}

const STORAGE_ACCOUNTS_KEY = 'parallels_saved_accounts';
const STORAGE_ACTIVE_KEY = 'parallels_active_account_id';

const AVATAR_GRADIENTS = [
  'linear-gradient(135deg, #a855f7 0%, #ec4899 100%)',
  'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
  'linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)',
  'linear-gradient(135deg, #10b981 0%, #06b6d4 100%)',
  'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)',
  'linear-gradient(135deg, #6366f1 0%, #d946ef 100%)',
];

function getRandomGradient(): string {
  return AVATAR_GRADIENTS[Math.floor(Math.random() * AVATAR_GRADIENTS.length)];
}

export class AuthManager {
  private accounts: UserAccount[] = [];
  private activeAccountId: string | null = null;
  private listeners: Set<(account: UserAccount | null) => void> = new Set();

  constructor() {
    this.loadFromStorage();
    this.initSupabaseSync();
  }

  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(STORAGE_ACCOUNTS_KEY);
      if (stored) {
        this.accounts = JSON.parse(stored);
      }
      this.activeAccountId = localStorage.getItem(STORAGE_ACTIVE_KEY);
    } catch {
      this.accounts = [];
      this.activeAccountId = null;
    }
  }

  private saveToStorage(): void {
    try {
      localStorage.setItem(STORAGE_ACCOUNTS_KEY, JSON.stringify(this.accounts));
      if (this.activeAccountId) {
        localStorage.setItem(STORAGE_ACTIVE_KEY, this.activeAccountId);
      } else {
        localStorage.removeItem(STORAGE_ACTIVE_KEY);
      }
    } catch (e) {
      console.warn('Could not save auth state to localStorage', e);
    }
  }

  private async initSupabaseSync(): Promise<void> {
    if (isSupabaseConfigured) {
      try {
        const supabase = getSupabaseClient();
        const { data } = await supabase.auth.getSession();
        if (data.session?.user) {
          const user = data.session.user;
          const existing = this.accounts.find((a) => a.id === user.id);
          if (existing) {
            this.activeAccountId = existing.id;
          } else {
            const newAcc: UserAccount = {
              id: user.id,
              email: user.email || 'user@parallels.app',
              displayName: user.user_metadata?.display_name || user.email?.split('@')[0] || 'User',
              avatarGradient: getRandomGradient(),
              createdAt: Date.now(),
              lastLoginAt: Date.now(),
            };
            this.accounts.push(newAcc);
            this.activeAccountId = newAcc.id;
          }
          this.saveToStorage();
          this.notify();
        }
      } catch {
        // Fallback to local session
      }
    }
  }

  public subscribe(listener: (account: UserAccount | null) => void): () => void {
    this.listeners.add(listener);
    listener(this.getActiveAccount());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    const active = this.getActiveAccount();
    this.listeners.forEach((listener) => listener(active));
  }

  public getActiveAccount(): UserAccount | null {
    if (!this.activeAccountId) return null;
    return this.accounts.find((a) => a.id === this.activeAccountId) || null;
  }

  public getSavedAccounts(): UserAccount[] {
    return [...this.accounts];
  }

  public async createAccount(
    email: string,
    displayName: string,
    password?: string
  ): Promise<UserAccount> {
    const cleanEmail = email.trim().toLowerCase();
    const cleanName = displayName.trim() || cleanEmail.split('@')[0] || 'User';

    // If Supabase is configured, create on Supabase Auth
    let userId = 'u_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    if (isSupabaseConfigured && password) {
      try {
        const supabase = getSupabaseClient();
        const { data, error } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            data: { display_name: cleanName },
          },
        });
        if (error) throw error;
        if (data.user) {
          userId = data.user.id;
        }
      } catch (err) {
        console.warn('Supabase signup failed, using local account fallback', err);
      }
    }

    // Check if account already exists
    let account = this.accounts.find((a) => a.email === cleanEmail);
    if (account) {
      account.displayName = cleanName;
      account.lastLoginAt = Date.now();
    } else {
      account = {
        id: userId,
        email: cleanEmail,
        displayName: cleanName,
        avatarGradient: getRandomGradient(),
        createdAt: Date.now(),
        lastLoginAt: Date.now(),
      };
      this.accounts.push(account);
    }

    this.activeAccountId = account.id;
    this.saveToStorage();
    this.notify();
    return account;
  }

  public async login(email: string, password?: string): Promise<UserAccount> {
    const cleanEmail = email.trim().toLowerCase();

    if (isSupabaseConfigured && password) {
      try {
        const supabase = getSupabaseClient();
        const { data, error } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });
        if (error) throw error;
        if (data.user) {
          let existing = this.accounts.find((a) => a.id === data.user.id);
          if (!existing) {
            existing = {
              id: data.user.id,
              email: cleanEmail,
              displayName: data.user.user_metadata?.display_name || cleanEmail.split('@')[0],
              avatarGradient: getRandomGradient(),
              createdAt: Date.now(),
              lastLoginAt: Date.now(),
            };
            this.accounts.push(existing);
          }
          this.activeAccountId = existing.id;
          this.saveToStorage();
          this.notify();
          return existing;
        }
      } catch (err) {
        console.warn('Supabase login error, checking local store', err);
      }
    }

    let account = this.accounts.find((a) => a.email === cleanEmail);
    if (!account) {
      // Auto-create local account for instant login experience
      account = {
        id: 'u_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
        email: cleanEmail,
        displayName: cleanEmail.split('@')[0] || 'User',
        avatarGradient: getRandomGradient(),
        createdAt: Date.now(),
        lastLoginAt: Date.now(),
      };
      this.accounts.push(account);
    } else {
      account.lastLoginAt = Date.now();
    }

    this.activeAccountId = account.id;
    this.saveToStorage();
    this.notify();
    return account;
  }

  public switchAccount(accountId: string): UserAccount {
    const target = this.accounts.find((a) => a.id === accountId);
    if (!target) {
      throw new Error('Account not found');
    }

    target.lastLoginAt = Date.now();
    this.activeAccountId = target.id;
    this.saveToStorage();
    this.notify();
    return target;
  }

  public async logout(): Promise<void> {
    if (isSupabaseConfigured) {
      try {
        const supabase = getSupabaseClient();
        await supabase.auth.signOut();
      } catch {}
    }

    this.activeAccountId = null;
    this.saveToStorage();
    this.notify();
  }

  public removeAccount(accountId: string): void {
    this.accounts = this.accounts.filter((a) => a.id !== accountId);
    if (this.activeAccountId === accountId) {
      this.activeAccountId = this.accounts.length > 0 ? this.accounts[0].id : null;
    }
    this.saveToStorage();
    this.notify();
  }
}

export const authManager = new AuthManager();
