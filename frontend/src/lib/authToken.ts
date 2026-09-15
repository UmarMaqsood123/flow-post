/**
 * The access token is kept in memory only — never localStorage — so an XSS bug
 * cannot read a long-lived credential. After a reload the session is restored
 * from the httpOnly refresh cookie (see `refreshSession` in lib/api.ts).
 */
let accessToken: string | null = null;

export const getAccessToken = () => accessToken;

export const setAccessToken = (token: string) => {
  accessToken = token;
};

export const clearAccessToken = () => {
  accessToken = null;
};
