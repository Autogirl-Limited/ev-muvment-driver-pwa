// The temporary password is carried from sign-in to the "set your password" screen so it can be
// prefilled. It lives in sessionStorage only (cleared with the tab) and is removed once used.
const KEY = "ev_muvment_temp_password";

export const saveTemporaryPassword = (password: string) => window.sessionStorage.setItem(KEY, password);
export const getTemporaryPassword = () => window.sessionStorage.getItem(KEY) ?? "";
export const clearTemporaryPassword = () => window.sessionStorage.removeItem(KEY);
