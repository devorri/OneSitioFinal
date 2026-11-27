// "Recent logins" on the login page (like Facebook). Stored only in this browser.
export interface RecentAccount {
  email: string
  name: string
  staff: boolean
  avatar?: string | null
}

const KEY = 'onesitio-recent-accounts'

export function getRecentAccounts(): RecentAccount[] {
  try {
    const raw = localStorage.getItem(KEY)
    const list = raw ? (JSON.parse(raw) as RecentAccount[]) : []
    return Array.isArray(list) ? list.slice(0, 5) : []
  } catch {
    return []
  }
}

export function rememberAccount(acc: RecentAccount) {
  try {
    const list = getRecentAccounts().filter((a) => a.email !== acc.email)
    localStorage.setItem(KEY, JSON.stringify([acc, ...list].slice(0, 5)))
  } catch {
    /* ignore */
  }
}

export function forgetAccount(email: string) {
  try {
    localStorage.setItem(KEY, JSON.stringify(getRecentAccounts().filter((a) => a.email !== email)))
  } catch {
    /* ignore */
  }
}
